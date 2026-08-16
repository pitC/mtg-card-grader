import { fetchAllSets, expansionSets, suggestSets } from './scryfall.js';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

// URL for opening a set, keeping any other query params (e.g. ?proxy=).
export function buildSetUrl(code) {
  const params = new URLSearchParams(location.search);
  params.set('set', String(code).toLowerCase());
  return `?${params.toString()}`;
}

export function filterSets(sets, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return sets.filter(s => (s.name || '').toLowerCase().includes(q));
}

export function setItemHtml(set) {
  const icon = set.icon_svg_uri
    ? `<img class="set-item-icon" src="${escapeHtml(set.icon_svg_uri)}" alt="">`
    : '<span class="set-item-icon placeholder" aria-hidden="true"></span>';
  const meta = [set.code.toUpperCase(), set.set_type, set.released_at].filter(Boolean).join(' · ');
  return `
    <button type="button" class="set-item" data-code="${escapeHtml(set.code)}">
      ${icon}
      <span class="set-item-info">
        <span class="set-item-name">${escapeHtml(set.name)}</span>
        <span class="set-item-meta">${escapeHtml(meta)}</span>
      </span>
    </button>
  `;
}

export function renderSetList(container, sets) {
  container.innerHTML = sets.map(setItemHtml).join('');
}

export function renderRecentSets(el, sets) {
  el.recentSetsEmpty.style.display = sets.length ? 'none' : 'block';
  renderSetList(el.recentSets, sets);
}

export function updateSearchResults(el, sets) {
  const q = el.setSearch.value;
  const searching = q.trim().length > 0;

  el.setRecentSection.style.display = searching ? 'none' : 'block';

  if (!searching) {
    el.setSearchResults.style.display = 'none';
    el.setSearchInfo.style.display = 'none';
    return;
  }

  const results = filterSets(sets, q).slice(0, 12);
  el.setSearchInfo.style.display = results.length ? 'none' : 'block';
  el.setSearchInfo.textContent = results.length ? '' : 'No sets match your search.';
  renderSetList(el.setSearchResults, results);
  el.setSearchResults.style.display = 'block';
}

function handleSetClick(e) {
  const btn = e.target.closest('.set-item');
  if (!btn) return;
  location.href = buildSetUrl(btn.dataset.code);
}

function selectFirstResult(el) {
  const first = el.setSearchResults.querySelector('.set-item');
  if (first) location.href = buildSetUrl(first.dataset.code);
}

// Fetches the set catalog and wires up the starting screen: three expansion-set
// suggestions (sets released or to be released within +/- 1 month, filled out
// with the latest released sets), plus live name search.
export async function initSetSelect(el) {
  const sets = await fetchAllSets();
  const pool = expansionSets(sets);

  renderRecentSets(el, suggestSets(pool, 3));

  el.setSearch.addEventListener('input', () => updateSearchResults(el, pool));
  el.setSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      selectFirstResult(el);
    }
  });
  el.setSearchResults.addEventListener('click', handleSetClick);
  el.recentSets.addEventListener('click', handleSetClick);
}