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
  if (!res.ok) throw new Error('Request failed: ' + res.status);
  return res.json();
}

export function getSetCodeFromUrl() {
  const code = new URLSearchParams(location.search).get('set');
  return code ? code.trim().toLowerCase() : null;
}

export async function fetchSetByCode(code) {
  return fetchJson(`https://api.scryfall.com/sets/${encodeURIComponent(code)}`);
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

export async function fetchSetCards(code) {
  let url = `https://api.scryfall.com/cards/search?q=e%3A${code}&order=set&unique=cards`;
  let all = [];
  while (url) {
    const page = await fetchJson(url);
    all = all.concat(page.data);
    url = page.has_more ? page.next_page : null;
    if (url) await new Promise(r => setTimeout(r, 80));
  }
  return all.filter(c => cardImageUrl(c));
}
