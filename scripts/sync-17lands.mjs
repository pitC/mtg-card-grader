#!/usr/bin/env node
// Sync 17Lands data to Firestore for given set(s).
// Usage: node scripts/sync-17lands.mjs hob
//        node scripts/sync-17lands.mjs --set hob
//        make sync-17lands SET=hob
//        make sync-17lands SET=hob,fin,eoq
// Writes to Firestore collection `actualGrades` doc id = lowercase set code.
// Requires locally authed Firebase CLI:
//   firebase login
//   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/firebase,https://www.googleapis.com/auth/datastore
// Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON.
// Firestore rules for actualGrades must allow writes (see README).

import admin from 'firebase-admin';
import { execSync } from 'child_process';

const FIREBASE_PROJECT_ID = 'mtg-card-grader';

// Copied from js/constants.js / js/actualGrades.js to avoid ESM/CJS interop issues
const GRADE_THRESHOLDS = [
  ['A+', 99],
  ['A', 95],
  ['A-', 90],
  ['B+', 85],
  ['B', 76],
  ['B-', 68],
  ['C+', 57],
  ['C', 45],
  ['C-', 36],
  ['D+', 27],
  ['D', 17],
  ['D-', 5],
  ['F', 0],
];

const COMPARISON_DECKS = Object.freeze([
  { code: 'all', colors: null },
  { code: 'wu', colors: 'WU' },
  { code: 'ub', colors: 'UB' },
  { code: 'br', colors: 'BR' },
  { code: 'rg', colors: 'RG' },
  { code: 'wg', colors: 'WG' },
  { code: 'wb', colors: 'WB' },
  { code: 'ur', colors: 'UR' },
  { code: 'bg', colors: 'BG' },
  { code: 'wr', colors: 'WR' },
  { code: 'ug', colors: 'UG' },
]);

const MIN_GAMES_DRAWN_FOR_INFERENCE = 100;
const MIN_GAMES_DRAWN = 500;

function normalizeCardName(name) {
  return (name || '').replace(/\/\/\//g, '//');
}

function mean(values) {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function sampleStd(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - m) ** 2;
  return Math.sqrt(sumSquares / (values.length - 1));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
      Math.exp(-a * a));
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function scoreToGrade(score) {
  return GRADE_THRESHOLDS.find(([, threshold]) => score >= threshold)[0];
}

function computeGrades(recordsByDeck) {
  const cardStats = new Map();
  for (const [deckCode, records] of recordsByDeck.entries()) {
    const eligible = records.filter(record => record.gameCount >= MIN_GAMES_DRAWN_FOR_INFERENCE);
    if (eligible.length <= 1) continue;
    const winrates = eligible.map(record => record.winrate);
    const distMean = mean(winrates);
    const distStd = sampleStd(winrates);
    if (!distStd) continue;
    for (const record of eligible) {
      if (record.gameCount <= MIN_GAMES_DRAWN) continue;
      const score = normalCdf((record.winrate - distMean) / distStd) * 100;
      const grade = scoreToGrade(score);
      let entry = cardStats.get(record.cardKey);
      if (!entry) {
        entry = {};
        cardStats.set(record.cardKey, entry);
      }
      entry[deckCode] = { winrate: record.winrate, gameCount: record.gameCount, score, grade };
    }
  }
  return cardStats;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let sets = [];
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--set' || arg === '--sets' || arg === '-s') {
      const val = args[++i];
      if (val) sets.push(...val.split(','));
    } else if (arg.startsWith('--set=')) {
      sets.push(...arg.slice('--set='.length).split(','));
    } else if (arg.startsWith('SET=')) {
      sets.push(...arg.slice('SET='.length).split(','));
    } else if (!arg.startsWith('-')) {
      sets.push(...arg.split(','));
    }
  }
  // Also check env SET
  if (!sets.length && process.env.SET) {
    sets.push(...process.env.SET.split(','));
  }
  sets = sets.map(s => s.trim().toLowerCase()).filter(Boolean);
  return { sets: [...new Set(sets)], dryRun: dryRun || process.env.DRY_RUN === '1' };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Request to ${url} failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= maxRetries) throw e;
      await sleep(1000 * 2 ** (attempt + 1));
    }
  }
}

function buildTargetUrl({ setCode, eventType, timePeriod, deck }) {
  const qp = {
    expansion: setCode.toUpperCase(),
    event_type: eventType,
    time_period: timePeriod,
  };
  if (deck.colors) qp.colors = deck.colors;
  return `https://www.17lands.com/api/card_data?${new URLSearchParams(qp)}`;
}

async function buildActualGradesForNode({ setCode, eventType = 'PremierDraft', timePeriod = 'ALL_TIME' }) {
  console.log(`[sync-17lands] Fetching 17Lands data for ${setCode} (${COMPARISON_DECKS.length} decks)...`);
  const results = [];
  for (const deck of COMPARISON_DECKS) {
    const url = buildTargetUrl({ setCode, eventType, timePeriod, deck });
    // Sequential to be nice to 17Lands
    const body = await fetchWithRetry(url);
    results.push(body && body.data ? body.data : []);
    // Small throttle between decks
    await sleep(150);
  }

  const recordsByDeck = new Map(
    COMPARISON_DECKS.map((deck, idx) => [
      deck.code,
      results[idx]
        .filter(c => c.ever_drawn_win_rate != null)
        .map(c => ({
          cardKey: normalizeCardName(c.name),
          winrate: c.ever_drawn_win_rate,
          gameCount: c.ever_drawn_game_count,
        })),
    ])
  );

  const cardStats = computeGrades(recordsByDeck);
  const byName = {};
  for (const [k, v] of cardStats) byName[k] = v;

  return {
    byName,
    decks: COMPARISON_DECKS.map(d => d.code),
    fetchedAt: new Date().toISOString(),
    setCode: setCode.toLowerCase(),
  };
}

function getAccessTokenFromGcloud() {
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (token) return token;
  } catch {}
  try {
    const token = execSync('gcloud auth application-default print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (token) return token;
  } catch {}
  return null;
}

async function writeViaRest(docId, payload) {
  const token = getAccessTokenFromGcloud();
  if (!token) {
    throw new Error('No gcloud access token found. Run `gcloud auth login` and `gcloud auth application-default login` or `firebase login`.');
  }
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/actualGrades/${docId}`;
  const body = {
    fields: {
      byNameJson: { stringValue: payload.byNameJson },
      decks: { arrayValue: { values: payload.decks.map(v => ({ stringValue: v })) } },
      fetchedAt: { stringValue: payload.fetchedAt },
      setCode: { stringValue: payload.setCode },
    },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore REST write failed ${res.status}: ${text}`);
  }
}

async function syncOneSet(setCode, db) {
  const result = await buildActualGradesForNode({ setCode });
  if (!Object.keys(result.byName).length) {
    console.warn(`[sync-17lands] No 17Lands data for ${setCode}, skipping Firestore write`);
    return;
  }

  // Firestore field names cannot contain '/', so store byName as JSON string
  const payload = {
    byNameJson: JSON.stringify(result.byName),
    decks: result.decks,
    fetchedAt: result.fetchedAt,
    setCode: result.setCode,
  };

  const docId = setCode.toLowerCase();
  console.log(`[sync-17lands] Writing actualGrades/${docId} (${Object.keys(result.byName).length} cards, fetchedAt ${result.fetchedAt})`);
  try {
    await db.collection('actualGrades').doc(docId).set(payload);
  } catch (e) {
    if (e.message && e.message.includes('Could not load the default credentials')) {
      console.warn('[sync-17lands] Admin SDK ADC not found, falling back to REST via `gcloud auth print-access-token`...');
      await writeViaRest(docId, payload);
    } else {
      throw e;
    }
  }
  console.log(`[sync-17lands] Done ${docId}`);
}

function getDb() {
  if (admin.apps.length) return admin.firestore();
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
    });
  } catch (e) {
    console.error('[sync-17lands] Failed to initialize Firebase Admin SDK.');
    console.error('  Ensure you are logged in via Firebase CLI and ADC is set:');
    console.error('    firebase login');
    console.error('    gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/firebase,https://www.googleapis.com/auth/datastore');
    console.error('  Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON.');
    console.error(`  Original error: ${e.message}`);
    throw e;
  }
  return admin.firestore();
}

async function main() {
  const { sets, dryRun } = parseArgs();
  if (!sets.length) {
    console.error('Usage: node scripts/sync-17lands.mjs <SET>  or  make sync-17lands SET=hob');
    console.error('  SET can be comma-separated: hob,fin,eoq');
    console.error('  Example: node scripts/sync-17lands.mjs hob');
    console.error('  Add --dry-run to fetch without writing to Firestore');
    process.exit(1);
  }

  console.log(`[sync-17lands] Sets: ${sets.join(', ')}${dryRun ? ' (dry-run)' : ''}`);
  let db = null;
  if (!dryRun) {
    db = getDb();
  }

  for (const setCode of sets) {
    try {
      if (dryRun) {
        const result = await buildActualGradesForNode({ setCode });
        console.log(`[sync-17lands] Dry-run ${setCode}: ${Object.keys(result.byName).length} cards, fetchedAt ${result.fetchedAt}`);
        // Validate Firestore payload size
        const payload = JSON.stringify({ byNameJson: JSON.stringify(result.byName), decks: result.decks, fetchedAt: result.fetchedAt });
        console.log(`[sync-17lands] Payload size ${(payload.length / 1024).toFixed(1)}KB`);
      } else {
        await syncOneSet(setCode, db);
      }
    } catch (e) {
      if (e.message && e.message.includes('Could not load the default credentials')) {
        console.error('[sync-17lands] Firestore auth failed - no Application Default Credentials found.');
        console.error('  Run:');
        console.error('    gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/firebase,https://www.googleapis.com/auth/datastore');
        console.error('  Or: gcloud auth login  &&  firebase login  &&  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json');
      }
      console.error(`[sync-17lands] Failed for ${setCode}:`, e);
      process.exitCode = 1;
    }
    // Throttle between sets
    if (sets.length > 1) await sleep(500);
  }
}

main();
