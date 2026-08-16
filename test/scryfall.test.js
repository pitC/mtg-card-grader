// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cardImageUrl,
  fetchJson,
  getSetCodeFromUrl,
  fetchSetByCode,
  loadSetCache,
  saveSetCache,
  fetchAllSets,
  expansionSets,
  setsInWindow,
  suggestSets,
  findLatestSet,
  findRecentSets,
  fetchSetCards,
  loadSetCardsCache,
  saveSetCardsCache,
} from '../js/scryfall.js';

const NORMAL_URIS = {
  small: 'https://img.scryfall.com/small.jpg',
  normal: 'https://img.scryfall.com/normal.jpg',
  large: 'https://img.scryfall.com/large.jpg',
};

describe('cardImageUrl', () => {
  it('defaults to the normal size', () => {
    expect(cardImageUrl({ image_uris: NORMAL_URIS })).toBe(NORMAL_URIS.normal);
  });

  it('returns the requested size when available', () => {
    expect(cardImageUrl({ image_uris: NORMAL_URIS }, 'large')).toBe(NORMAL_URIS.large);
  });

  it('falls back to normal when the requested size is missing', () => {
    expect(cardImageUrl({ image_uris: NORMAL_URIS }, 'png')).toBe(NORMAL_URIS.normal);
  });

  it('reads image_uris from the first card face', () => {
    const card = { card_faces: [{ image_uris: NORMAL_URIS }] };
    expect(cardImageUrl(card, 'small')).toBe(NORMAL_URIS.small);
  });

  it('returns empty string when there is no image', () => {
    expect(cardImageUrl({})).toBe('');
    expect(cardImageUrl({ card_faces: [{}] })).toBe('');
  });
});

describe('fetchJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests JSON and parses the body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ hello: 'world' }),
    });
    const data = await fetchJson('https://api.scryfall.com/whatever');
    expect(fetch).toHaveBeenCalledWith('https://api.scryfall.com/whatever', {
      headers: { Accept: 'application/json' },
    });
    expect(data).toEqual({ hello: 'world' });
  });

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchJson('https://api.scryfall.com/nope')).rejects.toThrow('Request failed: 404');
  });
});

describe('getSetCodeFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads, trims and lowercases the set parameter', () => {
    vi.stubGlobal('location', { search: '?set=  DSK  ' });
    expect(getSetCodeFromUrl()).toBe('dsk');
  });

  it('returns null when the parameter is missing', () => {
    vi.stubGlobal('location', { search: '?foo=bar' });
    expect(getSetCodeFromUrl()).toBeNull();
  });
});

describe('fetchSetByCode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('URL-encodes the set code and fetches it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'dsk' }),
    });
    expect(await fetchSetByCode('dsk')).toEqual({ code: 'dsk' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.scryfall.com/sets/dsk',
      expect.anything()
    );
    fetchMock.mockRestore();
  });

  it('serves the result from cache on subsequent calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'dsk', name: 'Duskmourn' }),
    });
    expect(await fetchSetByCode('dsk')).toEqual({ code: 'dsk', name: 'Duskmourn' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    expect(await fetchSetByCode('dsk')).toEqual({ code: 'dsk', name: 'Duskmourn' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('prompts a refetch once the cache has expired', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'hob' }),
    });
    expect(await fetchSetByCode('hob')).toEqual({ code: 'hob' });

    vi.setSystemTime(new Date('2026-01-02T01:00:00Z'));
    fetchMock.mockClear();
    await fetchSetByCode('hob');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});

describe('fetchAllSets', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the sets array from the catalog', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ code: 'dsk' }, { code: 'mkm' }] }),
    });
    expect(await fetchAllSets()).toEqual([{ code: 'dsk' }, { code: 'mkm' }]);
    expect(fetch).toHaveBeenCalledWith('https://api.scryfall.com/sets', expect.anything());
  });
});

function isoDaysFromNow(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('expansionSets', () => {
  it('keeps only expansion sets with cards and a release date', () => {
    const sets = [
      { code: 'dsk', card_count: 300, released_at: isoDaysFromNow(-2), set_type: 'expansion' },
      { code: 'cmdr', card_count: 100, released_at: isoDaysFromNow(-2), set_type: 'commander' },
      { code: 'tok', card_count: 20, released_at: isoDaysFromNow(-2), set_type: 'token' },
      { code: 'nocard', card_count: 0, released_at: isoDaysFromNow(-2), set_type: 'expansion' },
      { code: 'nodate', card_count: 1, set_type: 'expansion' },
    ];
    expect(expansionSets(sets).map(s => s.code)).toEqual(['dsk']);
  });
});

describe('setsInWindow', () => {
  it('keeps real sets released within the window, newest first', () => {
    const sets = [
      { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
      { code: 'tok', card_count: 1, released_at: isoDaysFromNow(-2), set_type: 'token' },
      { code: 'mid', card_count: 1, released_at: isoDaysFromNow(-2), set_type: 'expansion' },
      { code: 'new', card_count: 1, released_at: isoDaysFromNow(10), set_type: 'expansion' },
      { code: 'nocard', card_count: 0, released_at: isoDaysFromNow(-1), set_type: 'expansion' },
    ];
    expect(setsInWindow(sets).map(s => s.code)).toEqual(['new', 'mid']);
  });
});

describe('suggestSets', () => {
  it('puts sets in the window first and fills with the latest released sets', () => {
    const sets = [
      { code: 'older', card_count: 1, released_at: isoDaysFromNow(-180), set_type: 'expansion' },
      { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
      { code: 'new', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'expansion' },
    ];
    expect(suggestSets(sets).map(s => s.code)).toEqual(['new', 'old', 'older']);
  });

  it('ignores non-expansion sets even when they are recent', () => {
    const sets = [
      { code: 'cmdr', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'commander' },
      { code: 'a', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'expansion' },
      { code: 'b', card_count: 1, released_at: isoDaysFromNow(-2), set_type: 'expansion' },
    ];
    expect(suggestSets(sets).map(s => s.code)).toEqual(['a', 'b']);
  });

  it('respects the requested count', () => {
    const sets = [
      { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
      { code: 'a', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'expansion' },
      { code: 'b', card_count: 1, released_at: isoDaysFromNow(0), set_type: 'expansion' },
      { code: 'c', card_count: 1, released_at: isoDaysFromNow(-1), set_type: 'expansion' },
    ];
    expect(suggestSets(sets, 2).map(s => s.code)).toEqual(['a', 'b']);
  });

  it('never suggests future sets releasing more than a month out', () => {
    const sets = [
      { code: 'far', card_count: 1, released_at: isoDaysFromNow(45), set_type: 'expansion' },
      { code: 'new', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'expansion' },
      { code: 'old', card_count: 1, released_at: isoDaysFromNow(-30), set_type: 'expansion' },
      { code: 'older', card_count: 1, released_at: isoDaysFromNow(-60), set_type: 'expansion' },
    ];
    expect(suggestSets(sets).map(s => s.code)).toEqual(['new', 'old', 'older']);
  });

  it('orders upcoming sets by soonest release first', () => {
    const sets = [
      { code: 'later', card_count: 1, released_at: isoDaysFromNow(20), set_type: 'expansion' },
      { code: 'sooner', card_count: 1, released_at: isoDaysFromNow(5), set_type: 'expansion' },
      { code: 'old', card_count: 1, released_at: isoDaysFromNow(-30), set_type: 'expansion' },
    ];
    expect(suggestSets(sets).map(s => s.code)).toEqual(['sooner', 'later', 'old']);
  });

  it('shows only released sets when there is no upcoming set within a month', () => {
    const sets = [
      { code: 'old', card_count: 1, released_at: isoDaysFromNow(-30), set_type: 'expansion' },
      { code: 'older', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
      { code: 'new', card_count: 1, released_at: isoDaysFromNow(0), set_type: 'expansion' },
    ];
    expect(suggestSets(sets).map(s => s.code)).toEqual(['new', 'old', 'older']);
  });

  it('returns an empty list when there are no expansion sets', () => {
    expect(suggestSets([])).toEqual([]);
  });
});

describe('findLatestSet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the newest eligible set in the window', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
          { code: 'tok', card_count: 1, released_at: isoDaysFromNow(-2), set_type: 'token' },
          { code: 'recent', card_count: 1, released_at: isoDaysFromNow(-2), set_type: 'expansion' },
          { code: 'nocard', card_count: 0, released_at: isoDaysFromNow(-1), set_type: 'expansion' },
        ],
      }),
    });
    expect((await findLatestSet()).code).toBe('recent');
  });

  it('returns the newest expansion set when the window is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' }],
      }),
    });
    expect((await findLatestSet()).code).toBe('old');
  });

  it('returns undefined when there are no expansion sets', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: 'tok', card_count: 1, released_at: isoDaysFromNow(-2), set_type: 'token' }],
      }),
    });
    expect(await findLatestSet()).toBeUndefined();
  });
});

describe('findRecentSets', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suggests upcoming sets soonest-first, then recently released sets', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
          { code: 'a', card_count: 1, released_at: isoDaysFromNow(3), set_type: 'expansion' },
          { code: 'b', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'expansion' },
          { code: 'c', card_count: 1, released_at: isoDaysFromNow(-1), set_type: 'expansion' },
          { code: 'd', card_count: 1, released_at: isoDaysFromNow(-3), set_type: 'expansion' },
        ],
      }),
    });
    expect((await findRecentSets()).map(s => s.code)).toEqual(['b', 'a', 'c']);
  });

  it('respects the requested count', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'a', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'expansion' },
          { code: 'b', card_count: 1, released_at: isoDaysFromNow(0), set_type: 'expansion' },
          { code: 'c', card_count: 1, released_at: isoDaysFromNow(-1), set_type: 'expansion' },
        ],
      }),
    });
    expect((await findRecentSets(2)).map(s => s.code)).toEqual(['a', 'b']);
  });

  it('fills with the latest released sets when the window is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'older', card_count: 1, released_at: isoDaysFromNow(-120), set_type: 'expansion' },
          { code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' },
        ],
      }),
    });
    expect((await findRecentSets()).map(s => s.code)).toEqual(['old', 'older']);
  });

  it('never suggests non-expansion sets', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { code: 'cmdr', card_count: 1, released_at: isoDaysFromNow(1), set_type: 'commander' },
          { code: 'a', card_count: 1, released_at: isoDaysFromNow(2), set_type: 'expansion' },
          { code: 'b', card_count: 1, released_at: isoDaysFromNow(0), set_type: 'expansion' },
        ],
      }),
    });
    expect((await findRecentSets()).map(s => s.code)).toEqual(['a', 'b']);
  });
});

describe('fetchSetCards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('collects cards from a single page and filters imageless ones', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        has_more: false,
        data: [
          { id: '1', image_uris: { normal: 'a.jpg' } },
          { id: '2' },
          { id: '3', image_uris: { normal: 'b.jpg' } },
        ],
      }),
    });
    expect(await fetchSetCards('dsk')).toEqual([
      { id: '1', image_uris: { normal: 'a.jpg' } },
      { id: '3', image_uris: { normal: 'b.jpg' } },
    ]);
  });

  it('paginates through next_page links', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async url => ({
      ok: true,
      json: async () =>
        url.includes('page=2')
          ? { has_more: false, data: [{ id: 'b', image_uris: { normal: 'b.jpg' } }] }
          : {
              has_more: true,
              next_page: 'https://api.scryfall.com/page=2',
              data: [{ id: 'a', image_uris: { normal: 'a.jpg' } }],
            },
    }));
    const promise = fetchSetCards('dsk');
    await vi.advanceTimersByTimeAsync(1000);
    const cards = await promise;
    expect(cards.map(c => c.id)).toEqual(['a', 'b']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('serves the result from cache on subsequent calls', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        has_more: false,
        data: [{ id: '1', image_uris: { normal: 'a.jpg' } }],
      }),
    });
    const first = await fetchSetCards('dsk');
    expect(first).toEqual([{ id: '1', image_uris: { normal: 'a.jpg' } }]);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.mocked(fetch).mockClear();
    const second = await fetchSetCards('dsk');
    expect(second).toEqual(first);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prompts a refetch once the cache has expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        has_more: false,
        data: [{ id: '1', image_uris: { normal: 'a.jpg' } }],
      }),
    });
    await fetchSetCards('dsk');

    vi.mocked(fetch).mockClear();
    vi.setSystemTime(new Date('2026-01-02T01:00:00Z'));
    await fetchSetCards('dsk');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('set cache helpers', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is cached', () => {
    expect(loadSetCache('dsk')).toBeNull();
  });

  it('round-trips sets through localStorage', () => {
    const set = { code: 'dsk', name: 'Duskmourn' };
    saveSetCache('dsk', set);
    expect(loadSetCache('dsk')).toEqual(set);
  });

  it('keys the cache by set code', () => {
    saveSetCache('dsk', { code: 'dsk' });
    expect(loadSetCache('mkm')).toBeNull();
  });

  it('rejects stale entries older than the TTL', () => {
    const stale = {
      set: { code: 'dsk' },
      fetchedAt: '2026-01-01T00:00:00Z',
    };
    vi.setSystemTime && vi.useFakeTimers({ now: new Date('2026-01-02T01:00:00Z') });
    localStorage.setItem('scryfallCardGraderSetMeta:dsk', JSON.stringify(stale));
    expect(loadSetCache('dsk')).toBeNull();
  });

  it('rejects malformed entries', () => {
    localStorage.setItem('scryfallCardGraderSetMeta:dsk', JSON.stringify({ set: 'nope' }));
    expect(loadSetCache('dsk')).toBeNull();
    localStorage.setItem('scryfallCardGraderSetMeta:dsk', '{not json');
    expect(loadSetCache('dsk')).toBeNull();
  });
});

describe('set cards cache helpers', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is cached', () => {
    expect(loadSetCardsCache('dsk')).toBeNull();
  });

  it('round-trips cards through localStorage', () => {
    const cards = [{ id: '1', image_uris: { normal: 'a.jpg' } }];
    saveSetCardsCache('dsk', cards);
    expect(loadSetCardsCache('dsk')).toEqual(cards);
  });

  it('keys the cache by set code', () => {
    saveSetCardsCache('dsk', [{ id: '1' }]);
    expect(loadSetCardsCache('mkm')).toBeNull();
  });

  it('rejects stale entries older than the TTL', () => {
    const stale = {
      cards: [{ id: '1' }],
      fetchedAt: '2026-01-01T00:00:00Z',
    };
    vi.setSystemTime && vi.useFakeTimers({ now: new Date('2026-01-02T01:00:00Z') });
    localStorage.setItem('scryfallCardGraderSetCards:dsk', JSON.stringify(stale));
    expect(loadSetCardsCache('dsk')).toBeNull();
  });

  it('rejects malformed entries', () => {
    localStorage.setItem('scryfallCardGraderSetCards:dsk', JSON.stringify({ cards: 'nope' }));
    expect(loadSetCardsCache('dsk')).toBeNull();
    localStorage.setItem('scryfallCardGraderSetCards:dsk', '{not json');
    expect(loadSetCardsCache('dsk')).toBeNull();
  });
});
