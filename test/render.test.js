// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  updateProgress,
  render,
  setTab,
  setFilter,
  toggleAnalysisChip,
  resetAnalysisFilters,
  syncAnalysisChips,
  findNextUngradedIndex,
} from '../js/render.js';

function makeChip(group, value) {
  const btn = document.createElement('button');
  btn.className = 'chip';
  btn.dataset.group = group;
  btn.dataset.value = value;
  return btn;
}

function makeEl() {
  const el = {
    progress: document.createElement('div'),
    gradeView: document.createElement('div'),
    gradeContent: document.createElement('div'),
    gradeEmpty: document.createElement('div'),
    gridView: document.createElement('div'),
    analysisView: document.createElement('div'),
    analysisFilters: document.createElement('div'),
    analysisLanes: document.createElement('div'),
    analysisSearch: document.createElement('input'),
    hoverCard: document.createElement('div'),
    hoverCardImg: document.createElement('img'),
    cardImage: document.createElement('img'),
    cardName: document.createElement('div'),
    cardSub: document.createElement('div'),
    seal: document.createElement('div'),
    gradeRow: document.createElement('div'),
    prevBtn: document.createElement('button'),
    nextBtn: document.createElement('button'),
    tabGroup: document.createElement('div'),
    filterGroup: document.createElement('div'),
  };
  for (const g of ['A', 'B', 'C']) {
    const btn = document.createElement('button');
    btn.dataset.grade = g;
    el.gradeRow.appendChild(btn);
  }
  el.gradeContent.style.display = 'none';
  el.gradeEmpty.style.display = 'none';
  el.hoverCard.style.display = 'none';

  const tabIds = ['grade', 'grid', 'analysis'];
  for (const t of tabIds) {
    const b = document.createElement('button');
    b.dataset.tab = t;
    el.tabGroup.appendChild(b);
  }
  for (const f of ['all', 'ungraded']) {
    const b = document.createElement('button');
    b.dataset.filter = f;
    el.filterGroup.appendChild(b);
  }
  el.analysisFilters.appendChild(makeChip('grades', 'A'));
  el.analysisFilters.appendChild(makeChip('grades', 'ungraded'));
  el.analysisFilters.appendChild(makeChip('colors', 'W'));
  el.analysisFilters.appendChild(makeChip('rarities', 'rare'));
  el.analysisSearch.id = 'analysis-search';
  return el;
}

function makeState(overrides = {}) {
  return {
    cards: [
      { id: 'a', name: 'Card A', rarity: 'rare', type_line: 'Creature', image_uris: { normal: 'a.jpg' } },
      { id: 'b', name: 'Card B', rarity: 'common', type_line: 'Land', image_uris: { normal: 'b.jpg' } },
      { id: 'c', name: 'Card C', rarity: 'rare', type_line: 'Instant', image_uris: { normal: 'c.jpg' } },
    ],
    filtered: [],
    index: 0,
    filter: 'all',
    tab: 'grade',
    grades: {},
    analysisFilters: { grades: [], colors: [], rarities: [], query: '' },
    ...overrides,
  };
}

describe('applyFilter', () => {
  it('keeps all cards when filter is all', () => {
    const state = makeState({ grades: { a: { grade: 'A' } } });
    state.filtered = [...state.cards];
    applyFilter(state);
    expect(state.filtered).toHaveLength(3);
  });

  it('keeps only ungraded cards when filter is ungraded', () => {
    const state = makeState({ filter: 'ungraded', grades: { a: { grade: 'A' } } });
    applyFilter(state);
    expect(state.filtered.map(c => c.id)).toEqual(['b', 'c']);
  });

  it('clamps index into the filtered range', () => {
    const state = makeState({ filter: 'ungraded', grades: { a: { grade: 'A' } }, index: 5 });
    applyFilter(state);
    expect(state.index).toBe(1);
  });
});

describe('findNextUngradedIndex', () => {
  it('returns the index of the first ungraded card', () => {
    const state = makeState({ grades: { a: { grade: 'A' }, c: { grade: 'C' } } });
    expect(findNextUngradedIndex(state)).toBe(1);
  });

  it('returns -1 when every card is graded', () => {
    const state = makeState({ grades: { a: { grade: 'A' }, b: { grade: 'B' }, c: { grade: 'C' } } });
    expect(findNextUngradedIndex(state)).toBe(-1);
  });

  it('returns 0 when no cards are graded', () => {
    const state = makeState();
    expect(findNextUngradedIndex(state)).toBe(0);
  });
});

describe('updateProgress', () => {
  it('reports the graded count', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' }, b: { grade: 'B' } } });
    updateProgress(state, el);
    expect(el.progress.innerHTML).toContain('<strong>2</strong> / 3 graded');
  });
});

describe('setTab', () => {
  it('activates the tab button and toggles view visibility', () => {
    const el = makeEl();
    const state = makeState();
    setTab('grid', state, el);
    expect(state.tab).toBe('grid');
    expect(el.gridView.style.display).toBe('grid');
    expect(el.gradeView.style.display).toBe('none');
    expect([...el.tabGroup.children].find(b => b.dataset.tab === 'grid').classList.contains('active')).toBe(true);
  });
});

describe('setFilter', () => {
  it('resets index and renders through the filter buttons', () => {
    const el = makeEl();
    const state = makeState({ index: 2 });
    setFilter('ungraded', state, el);
    expect(state.filter).toBe('ungraded');
    expect(state.index).toBe(0);
    expect([...el.filterGroup.children].find(b => b.dataset.filter === 'ungraded').classList.contains('active')).toBe(true);
  });
});

describe('toggleAnalysisChip', () => {
  function gradeChipA(el) {
    return el.analysisFilters.querySelector('button.chip[data-group="grades"][data-value="A"]');
  }

  it('adds a chip value and marks the button active', () => {
    const el = makeEl();
    const state = makeState();
    const chip = gradeChipA(el);
    toggleAnalysisChip(state, el, chip);
    expect(state.analysisFilters.grades).toEqual(['A']);
    expect(chip.classList.contains('active')).toBe(true);
  });

  it('removes a chip value on second toggle', () => {
    const el = makeEl();
    const state = makeState({ analysisFilters: { grades: ['A'], colors: [], rarities: [], query: '' } });
    const chip = gradeChipA(el);
    toggleAnalysisChip(state, el, chip);
    expect(state.analysisFilters.grades).toEqual([]);
    expect(chip.classList.contains('active')).toBe(false);
  });
});

describe('syncAnalysisChips', () => {
  it('synchronises the active class with the state', () => {
    const el = makeEl();
    const state = makeState({ analysisFilters: { grades: ['A'], colors: ['W'], rarities: [], query: '' } });
    syncAnalysisChips(state, el);
    const chips = [...el.analysisFilters.querySelectorAll('button.chip')];
    expect(chips.find(c => c.dataset.group === 'grades' && c.dataset.value === 'A').classList.contains('active')).toBe(true);
    expect(chips.find(c => c.dataset.group === 'colors' && c.dataset.value === 'W').classList.contains('active')).toBe(true);
    expect(chips.find(c => c.dataset.group === 'rarities').classList.contains('active')).toBe(false);
  });
});

describe('resetAnalysisFilters', () => {
  it('clears filters and the search input', () => {
    const el = makeEl();
    el.analysisSearch.value = 'lurrus';
    const state = makeState({
      analysisFilters: { grades: ['A'], colors: ['W'], rarities: ['rare'], query: 'lurrus' },
    });
    resetAnalysisFilters(state, el);
    expect(state.analysisFilters).toEqual({ grades: [], colors: [], rarities: [], query: '' });
    expect(el.analysisSearch.value).toBe('');
  });
});

describe('render', () => {
  it('shows the empty message for an empty filtered grade view', () => {
    const el = makeEl();
    const state = makeState({ filter: 'ungraded', grades: { a: { grade: 'A' }, b: { grade: 'B' }, c: { grade: 'C' } } });
    render(state, el);
    expect(el.gradeContent.style.display).toBe('none');
    expect(el.gradeEmpty.style.display).toBe('block');
  });

  it('fills the grade view for the current card', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } } });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    expect(el.seal.textContent).toBe('A');
    expect(el.seal.style.display).toBe('flex');
  });
});
