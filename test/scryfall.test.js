// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cardImageUrl,
  fetchJson,
  getSetCodeFromUrl,
  fetchSetByCode,
  findLatestSet,
  fetchSetCards,
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
});

describe('findLatestSet', () => {
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

  it('returns undefined when no set is in the window', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ code: 'old', card_count: 1, released_at: isoDaysFromNow(-90), set_type: 'expansion' }],
      }),
    });
    expect(await findLatestSet()).toBeUndefined();
  });
});

describe('fetchSetCards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
});
