import { ACTUAL_GRADE_BUCKETS, GRADE_THRESHOLDS, GRADES } from './constants.js';

// Based on the grading mechanism in limited-grades/src/lib/CardGrader.ts:
// winrates are relative within each deck (including "all"), fitted to a
// normal distribution, converted to a percentile score, then mapped to a
// letter grade via GRADE_THRESHOLDS.
const MIN_GAMES_DRAWN_FOR_INFERENCE = 100;
const MIN_GAMES_DRAWN = 500;

// Free for local development and dev origins (localhost, GitHub.io, CodePen…);
// production domains need an API key, hence the ?proxy= override.
export const DEFAULT_PROXY = 'https://corsproxy.io/?url={url}';

// The "all" deck plus the ten two-colour guild decks, mirroring the default
// deck list in limited-grades.
export const COMPARISON_DECKS = Object.freeze([
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

const CACHE_PREFIX = 'scryfallCardGraderActual:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// 17Lands references some split cards with three slashes instead of two.
export function normalizeCardName(name) {
  return (name || '').replace(/\/\/\//g, '//');
}

// The name 17Lands uses for a Scryfall card: split cards keep the full
// "A // B" name (e.g. DSK rooms), while every other multi-face layout
// (adventure, transform, modal_dfc, …) is referenced by its front face only.
export function cardLookupName(card) {
  if (card.layout === 'split') return card.name;
  if (card.card_faces && card.card_faces.length) return card.card_faces[0].name || card.name;
  return card.name;
}

function mean(values) {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

// Sample standard deviation (N-1), matching mathjs std() with the default
// "unbiased" normalisation used in limited-grades.
function sampleStd(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - m) ** 2;
  return Math.sqrt(sumSquares / (values.length - 1));
}

// Abramowitz & Stegun 7.1.26 approximation, accurate to ~1.5e-7.
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

export { scoreToGrade };

// Port of CardGrader.computeGrades(): for each deck, fit the eligible
// winrates to a normal distribution and assign each card a relative grade.
// Returns a Map of cardKey -> { [deckCode]: { winrate, gameCount, score, grade } }.
export function computeGrades(recordsByDeck) {
  const cardStats = new Map();
  for (const [deckCode, records] of recordsByDeck.entries()) {
    const eligible = records.filter(record => record.gameCount >= MIN_GAMES_DRAWN_FOR_INFERENCE);
    if (eligible.length <= 1) continue;

    const winrates = eligible.map(record => record.winrate);
    const distMean = mean(winrates);
    const distStd = sampleStd(winrates);
    if (!distStd) continue;

    for (const record of eligible) {
      // Cards with too few drawn games are graded at all.
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

function buildTargetUrl({ setCode, eventType, timePeriod, deck }) {
  const queryParams = {
    expansion: setCode.toUpperCase(),
    event_type: eventType,
    time_period: timePeriod,
  };
  if (deck.colors) queryParams.colors = deck.colors;
  return `https://www.17lands.com/api/card_data?${new URLSearchParams(queryParams)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Route 17Lands requests through a CORS proxy (or directly with
// ?proxy=direct) because 17Lands does not send CORS headers. The default
// corsproxy.io works for localhost and dev origins; production origins can
// pass their own proxy (or a {url} placeholder pattern) via ?proxy=.
export function getConfiguredProxy() {
  if (typeof location === 'undefined') return DEFAULT_PROXY;
  const proxy = new URLSearchParams(location.search).get('proxy');
  if (proxy == null) return DEFAULT_PROXY;
  const trimmed = proxy.trim();
  if (!trimmed || trimmed === 'direct' || trimmed === 'none') return null;
  return trimmed;
}

export function proxyUrl(targetUrl) {
  const proxy = getConfiguredProxy();
  if (!proxy) return targetUrl;
  if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(targetUrl));
  return proxy + encodeURIComponent(targetUrl);
}

function fetchWithTimeout(url, init, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchWithRetry(url, maxRetries = 3) {
  let retries = 0;
  for (;;) {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Request to ${url} failed: ${response.status}`);
      return response.json();
    } catch (error) {
      retries += 1;
      if (retries > maxRetries) throw error;
      await sleep(1000 * 2 ** retries);
    }
  }
}

async function fetchApiCards({ setCode, eventType, timePeriod, deck }) {
  const url = proxyUrl(buildTargetUrl({ setCode, eventType, timePeriod, deck }));
  const body = await fetchWithRetry(url);
  return body && body.data ? body.data : [];
}

// Fetch every deck from 17Lands and compute actual grades. Returns
// { byName, decks, fetchedAt } where byName maps a normalized card name to
// { [deckCode]: { winrate, gameCount, score, grade } }.
export async function buildActualGrades({
  setCode,
  eventType = 'PremierDraft',
  timePeriod = 'ALL_TIME',
}) {
  const results = await Promise.all(
    COMPARISON_DECKS.map(deck => fetchApiCards({ setCode, eventType, timePeriod, deck }))
  );
  const recordsByDeck = new Map(
    COMPARISON_DECKS.map((deck, index) => [
      deck.code,
      results[index]
        .filter(apiCard => apiCard.ever_drawn_win_rate != null)
        .map(apiCard => ({
          cardKey: normalizeCardName(apiCard.name),
          winrate: apiCard.ever_drawn_win_rate,
          gameCount: apiCard.ever_drawn_game_count,
        })),
    ])
  );

  const cardStats = computeGrades(recordsByDeck);
  const byName = {};
  for (const [cardKey, stats] of cardStats) byName[cardKey] = stats;

  return {
    byName,
    decks: COMPARISON_DECKS.map(deck => deck.code),
    fetchedAt: new Date().toISOString(),
  };
}

function cacheKey(setCode) {
  return `${CACHE_PREFIX}${setCode}`;
}

export function loadActualCache(setCode) {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(cacheKey(setCode));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !value.fetchedAt) return null;
    if (Date.now() - new Date(value.fetchedAt).getTime() > CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveActualCache(setCode, result) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(cacheKey(setCode), JSON.stringify(result));
}

// Signed grade difference between the own A-E grade and the bucketed actual
// grade (own index minus bucket index on the A..E ladder). Negative means the
// own grade is higher (overrated), positive means lower (underrated). Returns
// null when either side is missing.
export function compareOwnVsActualDelta(ownGrade, actualGrade) {
  const bucket = actualGrade == null ? null : ACTUAL_GRADE_BUCKETS[actualGrade];
  if (!ownGrade || !bucket) return null;
  return GRADES.indexOf(ownGrade) - GRADES.indexOf(bucket);
}

// Classify an own grade against the A-E bucket of the actual grade:
// 'match', 'over' (own grade is better than the data), or 'under'. Returns
// null when either side is missing.
export function compareOwnVsActual(ownGrade, actualGrade) {
  const delta = compareOwnVsActualDelta(ownGrade, actualGrade);
  if (delta == null) return null;
  if (delta === 0) return 'match';
  return delta < 0 ? 'over' : 'under';
}