export function cardImageUrl(card, size) {
  size = size || 'normal';
  if (card.image_uris) return card.image_uris[size] || card.image_uris.normal || '';
  if (card.card_faces && card.card_faces[0].image_uris) {
    const uris = card.card_faces[0].image_uris;
    return uris[size] || uris.normal || '';
  }
  return '';
}

export async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function getSetCodeFromUrl() {
  const code = new URLSearchParams(location.search).get('set');
  return code ? code.trim().toLowerCase() : null;
}

const SET_CACHE_PREFIX = 'scryfallCardGraderSetMeta:';
const SET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function setCacheKey(code) {
  return `${SET_CACHE_PREFIX}${code}`;
}

export function loadSetCache(code) {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(setCacheKey(code));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !value.set || !value.fetchedAt) return null;
    if (Date.now() - new Date(value.fetchedAt).getTime() > SET_CACHE_TTL_MS) return null;
    return value.set;
  } catch {
    return null;
  }
}

export function saveSetCache(code, set) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(setCacheKey(code), JSON.stringify({ set, fetchedAt: new Date().toISOString() }));
}

export async function fetchSetByCode(code) {
  const cached = loadSetCache(code);
  if (cached) return cached;
  const set = await fetchJson(`https://api.scryfall.com/sets/${encodeURIComponent(code)}`);
  saveSetCache(code, set);
  return set;
}

export async function fetchAllSets() {
  const data = await fetchJson('https://api.scryfall.com/sets');
  return data.data;
}

// Sets with real cards available to grade. The app grades expansion sets only.
export function expansionSets(sets) {
  return sets.filter(s => s.card_count > 0 && s.released_at && s.set_type === 'expansion');
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Sets released within +/- 1 month of today, newest first, excluding token-like
// sets that have no real cards to grade.
export function setsInWindow(sets) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthFromNow = new Date(today);
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

  const minDate = toDateStr(oneMonthAgo);
  const maxDate = toDateStr(oneMonthFromNow);

  const candidates = sets.filter(s =>
    s.card_count > 0 &&
    s.released_at &&
    s.released_at >= minDate &&
    s.released_at <= maxDate &&
    s.set_type !== 'token' &&
    s.set_type !== 'memorabilia'
  );
  candidates.sort((a, b) => b.released_at.localeCompare(a.released_at));
  return candidates;
}

// Starting-screen suggestions: expansion sets to be released within the next
// month first (soonest first), then the most recently released expansion sets
// to fill the list up to `count`. Future sets releasing further out are never
// suggested.
export function suggestSets(sets, count = 3) {
  const pool = expansionSets(sets);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthFromNow = new Date(today);
  monthFromNow.setMonth(monthFromNow.getMonth() + 1);
  const todayStr = toDateStr(today);
  const maxDate = toDateStr(monthFromNow);

  const upcoming = pool
    .filter(s => s.released_at > todayStr && s.released_at <= maxDate)
    .sort((a, b) => a.released_at.localeCompare(b.released_at));
  const released = pool
    .filter(s => s.released_at <= todayStr)
    .sort((a, b) => b.released_at.localeCompare(a.released_at));

  return upcoming.concat(released).slice(0, count);
}

export async function findLatestSet() {
  const sets = await fetchAllSets();
  return suggestSets(sets, 1)[0];
}

export async function findRecentSets(count = 3) {
  const sets = await fetchAllSets();
  return suggestSets(sets, count);
}

const CARDS_CACHE_PREFIX = 'scryfallCardGraderSetCards:';
const CARDS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cardsCacheKey(code) {
  return `${CARDS_CACHE_PREFIX}${code}`;
}

export function loadSetCardsCache(code) {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(cardsCacheKey(code));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.cards) || !value.fetchedAt) return null;
    if (Date.now() - new Date(value.fetchedAt).getTime() > CARDS_CACHE_TTL_MS) return null;
    return value.cards;
  } catch {
    return null;
  }
}

export function saveSetCardsCache(code, cards) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(cardsCacheKey(code), JSON.stringify({ cards, fetchedAt: new Date().toISOString() }));
}

export async function fetchSetCards(code) {
  const cached = loadSetCardsCache(code);
  if (cached) return cached;

  let url = `https://api.scryfall.com/cards/search?q=e%3A${code}&order=set&unique=cards`;
  let all = [];
  while (url) {
    const page = await fetchJson(url);
    all = all.concat(page.data);
    url = page.has_more ? page.next_page : null;
    if (url) await new Promise(r => setTimeout(r, 80));
  }
  const cards = all.filter(c => cardImageUrl(c));
  saveSetCardsCache(code, cards);
  return cards;
}
