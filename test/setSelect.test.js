// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  buildSetUrl,
  filterSets,
  setItemHtml,
  renderRecentSets,
  updateSearchResults,
  initSetSelect,
} from '../js/setSelect.js';
import { clearCacheForSet, clearAllCaches } from '../js/cache.js';

function makeEl() {
  return {
    recentSetsEmpty: document.createElement('div'),
    recentSetsLoading: document.createElement('div'),
    recentSets: document.createElement('div'),
    setSearch: document.createElement('input'),
    setSearchResults: document.createElement('div'),
    setSearchInfo: document.createElement('div'),
    setRecentSection: document.createElement('div'),
  };
}

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml(`A & B <b>"'`)).toBe('A &amp; B &lt;b&gt;&quot;&#39;');
  });
});

describe('buildSetUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets the set param and lowercases the code', () => {
    vi.stubGlobal('location', { search: '' });
    expect(buildSetUrl('DSK')).toBe('?set=dsk');
  });

  it('keeps other query params', () => {
    vi.stubGlobal('location', { search: '?proxy=https://proxy.example/' });
    expect(buildSetUrl('dsk')).toBe('?proxy=https%3A%2F%2Fproxy.example%2F&set=dsk');
  });
});

describe('filterSets', () => {
  const sets = [
    { code: 'dsk', name: 'Duskmourn: House of Horror' },
    { code: 'mkm', name: 'Murders at Karlov Manor' },
    { code: 'blb', name: 'Bloomburrow' },
  ];

  it('matches names case-insensitively', () => {
    expect(filterSets(sets, 'DUSK').map(s => s.code)).toEqual(['dsk']);
    expect(filterSets(sets, 'murders').map(s => s.code)).toEqual(['mkm']);
  });

  it('returns an empty list for a blank query', () => {
    expect(filterSets(sets, '   ')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterSets(sets, 'zzz')).toEqual([]);
  });
});

describe('setItemHtml', () => {
  it('renders name, code, type and release date', () => {
    const html = setItemHtml({
      code: 'dsk',
      name: 'Duskmourn: House of Horror',
      set_type: 'expansion',
      released_at: '2024-09-27',
    });
    expect(html).toContain('Duskmourn: House of Horror');
    expect(html).toContain('DSK · expansion · 2024-09-27');
    expect(html).toContain('data-code="dsk"');
  });

  it('escapes the set name', () => {
    const html = setItemHtml({ code: 'abc', name: 'A <B> & "C"', set_type: 'funny' });
    expect(html).toContain('A &lt;B&gt; &amp; &quot;C&quot;');
  });

  it('renders a clear cache button next to the set', () => {
    const html = setItemHtml({
      code: 'dsk',
      name: 'Duskmourn: House of Horror',
      set_type: 'expansion',
      released_at: '2024-09-27',
    });
    expect(html).toContain('data-clear-cache="dsk"');
    expect(html).toContain('Clear cache');
    expect(html).toContain('set-item-row');
  });

  it('escapes the set code in the clear cache button', () => {
    const html = setItemHtml({ code: 'a"b', name: 'A', set_type: 'expansion', released_at: '2024-01-01' });
    expect(html).toContain('data-clear-cache="a&quot;b"');
  });
});

describe('clearCacheForSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('removes cached entries for the given set code', () => {
    localStorage.setItem('scryfallCardGraderSetMeta:dsk', JSON.stringify({ set: { code: 'dsk' }, fetchedAt: new Date().toISOString() }));
    localStorage.setItem('scryfallCardGraderSetCards:dsk', JSON.stringify({ cards: [], fetchedAt: new Date().toISOString() }));
    localStorage.setItem('scryfallCardGraderActual:dsk', JSON.stringify({ byName: {}, fetchedAt: new Date().toISOString() }));
    localStorage.setItem('scryfallCardGraderSetMeta:mkm', JSON.stringify({ set: { code: 'mkm' }, fetchedAt: new Date().toISOString() }));
    localStorage.setItem('keep', '1');
    const removed = clearCacheForSet('dsk');
    expect(removed).toBe(3);
    expect(localStorage.getItem('scryfallCardGraderSetMeta:dsk')).toBeNull();
    expect(localStorage.getItem('scryfallCardGraderSetCards:dsk')).toBeNull();
    expect(localStorage.getItem('scryfallCardGraderActual:dsk')).toBeNull();
    expect(localStorage.getItem('scryfallCardGraderSetMeta:mkm')).not.toBeNull();
    expect(localStorage.getItem('keep')).toBe('1');
  });

  it('is case-insensitive and returns 0 when there is no cache', () => {
    localStorage.setItem('scryfallCardGraderSetMeta:dsk', JSON.stringify({ set: {}, fetchedAt: new Date().toISOString() }));
    expect(clearCacheForSet('DSK')).toBe(1);
    expect(localStorage.getItem('scryfallCardGraderSetMeta:dsk')).toBeNull();
    expect(clearCacheForSet('dsk')).toBe(0);
  });

  it('clearAllCaches removes every cached entry', () => {
    localStorage.setItem('scryfallCardGraderSetMeta:dsk', '{}');
    localStorage.setItem('scryfallCardGraderActual:mkm', '{}');
    localStorage.setItem('keep', '1');
    expect(clearAllCaches()).toBe(2);
    expect(localStorage.getItem('keep')).toBe('1');
  });
});

describe('renderRecentSets', () => {
  it('shows an empty note when there are no sets', () => {
    const el = makeEl();
    renderRecentSets(el, []);
    expect(el.recentSetsEmpty.style.display).toBe('block');
    expect(el.recentSets.innerHTML).toBe('');
  });

  it('renders the sets and hides the empty note', () => {
    const el = makeEl();
    renderRecentSets(el, [{ code: 'dsk', name: 'Duskmourn', set_type: 'expansion', released_at: '2024-09-27' }]);
    expect(el.recentSetsEmpty.style.display).toBe('none');
    expect(el.recentSets.innerHTML).toContain('Duskmourn');
  });
});

describe('updateSearchResults', () => {
  const sets = [
    { code: 'dsk', name: 'Duskmourn: House of Horror' },
    { code: 'mkm', name: 'Murders at Karlov Manor' },
  ];

  it('hides results and shows the recent section for an empty query', () => {
    const el = makeEl();
    el.setSearch.value = '  ';
    updateSearchResults(el, sets);
    expect(el.setSearchResults.style.display).toBe('none');
    expect(el.setSearchInfo.style.display).toBe('none');
    expect(el.setRecentSection.style.display).toBe('block');
  });

  it('renders matching results and hides the recent section while searching', () => {
    const el = makeEl();
    el.setSearch.value = 'dusk';
    updateSearchResults(el, sets);
    expect(el.setRecentSection.style.display).toBe('none');
    expect(el.setSearchResults.style.display).toBe('block');
    expect(el.setSearchResults.innerHTML).toContain('Duskmourn');
    expect(el.setSearchInfo.style.display).toBe('none');
  });

  it('shows a message when nothing matches', () => {
    const el = makeEl();
    el.setSearch.value = 'zzz';
    updateSearchResults(el, sets);
    expect(el.setSearchResults.innerHTML).toBe('');
    expect(el.setSearchInfo.style.display).toBe('block');
    expect(el.setSearchInfo.textContent).toBe('No sets match your search.');
  });
});

describe('initSetSelect', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function isoDaysFromNow(days) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('suggests three expansion sets and wires up search', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion', name: 'Old' },
          { code: 'cmdr', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'commander', name: 'Commander Set' },
          { code: 'a', card_count: 1, released_at: isoDaysFromNow(3), set_type: 'expansion', name: 'Set A' },
          { code: 'b', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'expansion', name: 'Set B' },
          { code: 'c', card_count: 1, released_at: isoDaysFromNow(-1), set_type: 'expansion', name: 'Set C' },
          { code: 'd', card_count: 1, released_at: isoDaysFromNow(-3), set_type: 'expansion', name: 'Set D' },
        ],
      }),
    });
    const el = makeEl();
    await initSetSelect(el);

    const recentNames = [...el.recentSets.querySelectorAll('.set-item-name')].map(n => n.textContent);
    expect(recentNames).toEqual(['Set B', 'Set A', 'Set C']);
    expect(el.recentSets.textContent).not.toContain('Commander Set');

    el.setSearch.value = 'set d';
    el.setSearch.dispatchEvent(new Event('input'));
    expect(el.setSearchResults.textContent).toContain('Set D');
    expect(el.setRecentSection.style.display).toBe('none');
  });

  it('fills the suggestions with the latest released sets when the window has fewer than three', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'older', card_count: 1, released_at: isoDaysFromNow(-180), set_type: 'expansion', name: 'Set Older' },
          { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion', name: 'Set Old' },
          { code: 'new', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'expansion', name: 'Set New' },
        ],
      }),
    });
    const el = makeEl();
    await initSetSelect(el);

    const recentNames = [...el.recentSets.querySelectorAll('.set-item-name')].map(n => n.textContent);
    expect(recentNames).toEqual(['Set New', 'Set Old', 'Set Older']);
  });

  it('does not search non-expansion sets', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'cmdr', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'commander', name: 'Commander Set' },
          { code: 'a', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'expansion', name: 'Set A' },
        ],
      }),
    });
    const el = makeEl();
    await initSetSelect(el);

    el.setSearch.value = 'commander';
    el.setSearch.dispatchEvent(new Event('input'));
    expect(el.setSearchResults.innerHTML).toBe('');
    expect(el.setSearchInfo.style.display).toBe('block');
  });

  it('throws when the catalog request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 });
    await expect(initSetSelect(makeEl())).rejects.toThrow('Request failed: 500');
  });

  it('shows the loading indicator while fetching and hides it afterwards', async () => {
    let resolveFetch;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => {
      resolveFetch = () => resolve({
        ok: true,
        json: async () => ({ data: [] }),
      });
    }));

    const el = makeEl();
    const promise = initSetSelect(el);
    const loading = el.recentSetsLoading;
    expect(loading.style.display).toBe('flex');

    resolveFetch();
    await promise;
    expect(loading.style.display).toBe('none');
  });

  it('clear cache button removes the local cache without navigating', async () => {
    vi.stubGlobal('location', { href: 'http://localhost/', search: '' });
    localStorage.clear();
    localStorage.setItem('scryfallCardGraderSetMeta:b', JSON.stringify({ set: { code: 'b' }, fetchedAt: new Date().toISOString() }));
    localStorage.setItem('scryfallCardGraderSetCards:b', JSON.stringify({ cards: [], fetchedAt: new Date().toISOString() }));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'b', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'expansion', name: 'Set B' },
          { code: 'a', card_count: 1, released_at: isoDaysFromNow(3), set_type: 'expansion', name: 'Set A' },
          { code: 'c', card_count: 1, released_at: isoDaysFromNow(-1), set_type: 'expansion', name: 'Set C' },
        ],
      }),
    });
    const el = makeEl();
    await initSetSelect(el);
    const clearBtn = el.recentSets.querySelector('[data-clear-cache="b"]');
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    expect(localStorage.getItem('scryfallCardGraderSetMeta:b')).toBeNull();
    expect(localStorage.getItem('scryfallCardGraderSetCards:b')).toBeNull();
    // Should have changed button text and disabled state, not navigated
    expect(clearBtn.textContent).toBe('Cleared');
    expect(clearBtn.disabled).toBe(true);
  });
});
