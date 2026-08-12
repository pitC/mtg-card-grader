// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildActualGrades,
  cardLookupName,
  compareOwnVsActual,
  compareOwnVsActualDelta,
  computeGrades,
  DEFAULT_PROXY,
  getConfiguredProxy,
  loadActualCache,
  normalizeCardName,
  proxyUrl,
  saveActualCache,
  scoreToGrade,
} from '../js/actualGrades.js';
import { GRADE_THRESHOLDS } from '../js/constants.js';

// Reference distribution mirrored from Python (math.erf, sample std) for a
// 40-card deck with winrates 0.45 + i * 0.15/39, every card at 600 games.
const synthDeck = Object.freeze(
  Array.from({ length: 40 }, (_, i) => ({
    cardKey: `Card ${i + 1}`,
    winrate: 0.45 + (i * 0.15) / 39,
    gameCount: 600,
  }))
);

const EXPECTED_SYNTH_GRADES = [
  'F', 'D-', 'D-', 'D-', 'D-', 'D-', 'D-', 'D-', 'D-', 'D', 'D', 'D', 'D', 'D+', 'D+', 'D+', 'C-', 'C-',
  'C-', 'C', 'C', 'C', 'C+', 'C+', 'C+', 'B-', 'B-', 'B-', 'B', 'B', 'B', 'B', 'B+', 'B+', 'B+', 'A-',
  'A-', 'A-', 'A-', 'A',
];

describe('normalizeCardName', () => {
  it('collapses three slashes to two', () => {
    expect(normalizeCardName('Approach /// Second')).toBe('Approach // Second');
  });

  it('leaves ordinary names unchanged', () => {
    expect(normalizeCardName('Snapcaster Mage')).toBe('Snapcaster Mage');
  });
});

describe('cardLookupName', () => {
  it('keeps the full name for split cards', () => {
    expect(cardLookupName({ name: 'Fire // Ice', layout: 'split', card_faces: [{ name: 'Fire' }, { name: 'Ice' }] }))
      .toBe('Fire // Ice');
  });

  it('uses the front face name for adventure cards', () => {
    expect(cardLookupName({ name: 'Elite Interceptor // Rejoinder', layout: 'prepare', card_faces: [{ name: 'Elite Interceptor' }] }))
      .toBe('Elite Interceptor');
  });

  it('uses the front face name for transform cards', () => {
    expect(cardLookupName({ name: 'Snapcast Mystic // Long-Term Plans', layout: 'transform', card_faces: [{ name: 'Snapcast Mystic' }] }))
      .toBe('Snapcast Mystic');
  });

  it('falls back to the plain name for single-faced cards', () => {
    expect(cardLookupName({ name: 'Opt', layout: 'normal' })).toBe('Opt');
  });
});

describe('scoreToGrade', () => {
  it('uses the same thresholds as limited-grades', () => {
    expect(GRADE_THRESHOLDS).toEqual([
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
    ]);
  });

  it('maps boundary scores exactly', () => {
    expect(scoreToGrade(99)).toBe('A+');
    expect(scoreToGrade(98.9)).toBe('A');
    expect(scoreToGrade(90)).toBe('A-');
    expect(scoreToGrade(5)).toBe('D-');
    expect(scoreToGrade(4.9)).toBe('F');
  });
});

describe('computeGrades', () => {
  it('grades each card relatively to its deck', () => {
    const stats = computeGrades(new Map([['all', synthDeck]]));
    expect(stats.size).toBe(40);
    const grades = synthDeck.map(record => stats.get(record.cardKey).all.grade);
    expect(grades).toEqual(EXPECTED_SYNTH_GRADES);
  });

  it('scores from 0 to 100 and records winrate and game count', () => {
    const stats = computeGrades(new Map([['all', synthDeck]]));
    const entry = stats.get('Card 40').all;
    expect(entry.grade).toBe('A');
    expect(entry.score).toBeGreaterThan(90);
    expect(entry.score).toBeLessThanOrEqual(100);
    expect(entry.winrate).toBe(0.6);
    expect(entry.gameCount).toBe(600);
  });

  it('keeps per-deck stats separate', () => {
    const stats = computeGrades(
      new Map([
        ['all', synthDeck],
        ['wg', synthDeck.map((c, i) => ({ ...c, winrate: 0.6 - (i * 0.15) / 39 }))],
      ])
    );
    const entry = stats.get('Card 1');
    expect(entry.all.grade).toBe('F');
    expect(entry.wg.grade).toBe('A');
  });

  it('excludes cards under the inference threshold and leaves the rest ungraded', () => {
    const deck = [
      { cardKey: 'low', winrate: 0.6, gameCount: 50 },
      { cardKey: 'mid', winrate: 0.55, gameCount: 300 },
      { cardKey: 'high', winrate: 0.5, gameCount: 600 },
    ];
    const stats = computeGrades(new Map([['all', deck]]));
    expect(stats.has('low')).toBe(false);
    expect(stats.has('mid')).toBe(false);
    expect(stats.has('high')).toBe(true);
    expect(stats.get('high').all.grade).toBeDefined();
  });

  it('does not grade a deck with fewer than two inference-eligible cards', () => {
    const stats = computeGrades(new Map([['all', [{ cardKey: 'only', winrate: 0.5, gameCount: 800 }]]]));
    expect(stats.size).toBe(0);
  });

  it('skips a degenerate deck where every winrate is identical', () => {
    const stats = computeGrades(
      new Map([['all', [{ cardKey: 'a', winrate: 0.5, gameCount: 600 }, { cardKey: 'b', winrate: 0.5, gameCount: 600 }]]])
    );
    expect(stats.size).toBe(0);
  });
});

describe('compareOwnVsActual', () => {
  it('matches when the own grade equals the bucketed actual grade', () => {
    expect(compareOwnVsActual('B', 'B+')).toBe('match');
    expect(compareOwnVsActual('A', 'A+')).toBe('match');
  });

  it('reports over when the own grade is better than the data', () => {
    expect(compareOwnVsActual('A', 'B')).toBe('over');
    expect(compareOwnVsActual('B', 'C-')).toBe('over');
  });

  it('reports under when the own grade is worse than the data', () => {
    expect(compareOwnVsActual('C', 'B')).toBe('under');
    expect(compareOwnVsActual('E', 'D')).toBe('under');
  });

  it('returns null when either side is missing', () => {
    expect(compareOwnVsActual(null, 'A')).toBeNull();
    expect(compareOwnVsActual('A', null)).toBeNull();
  });
});

describe('compareOwnVsActualDelta', () => {
  it('is zero for a match', () => {
    expect(compareOwnVsActualDelta('B', 'B+')).toBe(0);
    expect(compareOwnVsActualDelta('A', 'A+')).toBe(0);
  });

  it('is negative when the own grade is higher, scaled by grade positions', () => {
    expect(compareOwnVsActualDelta('A', 'B')).toBe(-1);
    expect(compareOwnVsActualDelta('A', 'C')).toBe(-2);
    expect(compareOwnVsActualDelta('A', 'D')).toBe(-3);
    expect(compareOwnVsActualDelta('A', 'F')).toBe(-4);
  });

  it('is positive when the own grade is lower, scaled by grade positions', () => {
    expect(compareOwnVsActualDelta('B', 'A')).toBe(1);
    expect(compareOwnVsActualDelta('D', 'B')).toBe(2);
    expect(compareOwnVsActualDelta('E', 'C')).toBe(2);
  });

  it('returns null when either side is missing', () => {
    expect(compareOwnVsActualDelta(null, 'A')).toBeNull();
    expect(compareOwnVsActualDelta('A', null)).toBeNull();
  });
});

describe('proxy configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the corsproxy.io URL pattern', () => {
    vi.stubGlobal('location', { search: '' });
    expect(getConfiguredProxy()).toBe(DEFAULT_PROXY);
  });

  it('reads a proxy override from the URL', () => {
    vi.stubGlobal('location', { search: '?proxy=https://cors.eu.org/' });
    expect(getConfiguredProxy()).toBe('https://cors.eu.org/');
  });

  it('disables the proxy with proxy=direct', () => {
    vi.stubGlobal('location', { search: '?proxy=direct' });
    expect(getConfiguredProxy()).toBeNull();
  });

  it('substitutes {url} placeholders with an encoded target', () => {
    const out = proxyUrl('https://www.example.com/a?b=1&c=2');
    expect(out).toBe(`${DEFAULT_PROXY.replace('{url}', encodeURIComponent('https://www.example.com/a?b=1&c=2'))}`);
  });

  it('appends an encoded target when no placeholder is used', () => {
    vi.stubGlobal('location', { search: '?proxy=https://cors.eu.org/' });
    expect(proxyUrl('https://www.example.com/a')).toBe(`https://cors.eu.org/${encodeURIComponent('https://www.example.com/a')}`);
  });
});

describe('actual grade cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips results through localStorage', () => {
    const result = { byName: { 'Card 1': { all: { grade: 'B+' } } }, decks: ['all'], fetchedAt: new Date().toISOString() };
    saveActualCache('dsk', result);
    expect(loadActualCache('dsk')).toEqual(result);
  });

  it('returns null for an expired cache', () => {
    saveActualCache('dsk', {
      byName: {},
      decks: ['all'],
      fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    expect(loadActualCache('dsk')).toBeNull();
  });

  it('returns null when no cache exists', () => {
    expect(loadActualCache('dsk')).toBeNull();
  });
});

describe('buildActualGrades', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?proxy=direct' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches every deck and computes grades by card name', async () => {
    const apiCard = synthDeck.map(record => ({
      name: record.cardKey,
      ever_drawn_win_rate: record.winrate,
      ever_drawn_game_count: record.gameCount,
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: apiCard }),
    });

    const result = await buildActualGrades({ setCode: 'DSK' });
    expect(fetchMock).toHaveBeenCalledTimes(11);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.some(url => url.includes('expansion=DSK') && !url.includes('colors='))).toBe(true);
    expect(urls.some(url => url.includes('expansion=DSK') && url.includes('colors=WG'))).toBe(true);

    expect(result.byName['Card 40'].all.grade).toBe('A');
    expect(result.byName['Card 1'].all.grade).toBe('F');
    expect(result.decks).toHaveLength(11);
    expect(result.fetchedAt).toBeTruthy();
    fetchMock.mockRestore();
  });

  it('ignores cards without an ever-drawn win rate', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ name: 'No Stats', ever_drawn_win_rate: null, ever_drawn_game_count: 600 }] }),
    });
    const result = await buildActualGrades({ setCode: 'DSK' });
    expect(Object.keys(result.byName)).toHaveLength(0);
    fetchMock.mockRestore();
  });
});