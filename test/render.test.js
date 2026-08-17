// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  updateProgress,
  render,
  renderGridView,
  renderCompareSummary,
  setTab,
  gridFiltersActive,
  buildGridFilterBar,
  toggleGridChip,
  resetGridFilters,
  syncGridChips,
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
    gridFilters: document.createElement('div'),
    gridLanes: document.createElement('div'),
    gridSearch: document.createElement('input'),
    compareSummary: document.createElement('div'),
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
  };
  for (const g of ['A', 'B', 'C']) {
    const btn = document.createElement('button');
    btn.dataset.grade = g;
    el.gradeRow.appendChild(btn);
  }
  el.gradeContent.style.display = 'none';
  el.gradeEmpty.style.display = 'none';
  el.hoverCard.style.display = 'none';

  el.compareBtn = document.createElement('button');
  el.compareBtn.className = 'compare-btn';
  el.compareBtn.type = 'button';
  el.compareStatus = document.createElement('span');
  el.compareStatus.className = 'compare-status';
  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';
  toolbar.appendChild(el.compareBtn);
  toolbar.appendChild(el.compareStatus);
  el.gridView.appendChild(toolbar);

  const tabIds = ['grade', 'grid'];
  for (const t of tabIds) {
    const b = document.createElement('button');
    b.dataset.tab = t;
    el.tabGroup.appendChild(b);
  }
  el.gridFilters.appendChild(makeChip('grades', 'A'));
  el.gridFilters.appendChild(makeChip('grades', 'ungraded'));
  el.gridFilters.appendChild(makeChip('colors', 'W'));
  el.gridFilters.appendChild(makeChip('rarities', 'rare'));
  el.gridSearch.id = 'grid-search';
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
    tab: 'grade',
    grades: {},
    gridFilters: { grades: [], colors: [], rarities: [], query: '' },
    ...overrides,
  };
}

describe('applyFilter', () => {
  it('keeps all cards when no grid filters are active', () => {
    const state = makeState({ grades: { a: { grade: 'A' } } });
    applyFilter(state);
    expect(state.filtered).toHaveLength(3);
  });

  it('keeps only cards matching the grid filters', () => {
    const state = makeState({
      grades: { a: { grade: 'A' }, c: { grade: 'C' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    applyFilter(state);
    expect(state.filtered.map(c => c.id)).toEqual(['a']);
  });

  it('keeps only ungraded cards when the ungraded chip is active', () => {
    const state = makeState({
      grades: { a: { grade: 'A' } },
      gridFilters: { grades: ['ungraded'], colors: [], rarities: [], query: '' },
    });
    applyFilter(state);
    expect(state.filtered.map(c => c.id)).toEqual(['b', 'c']);
  });

  it('keeps cards matching the query against oracle text', () => {
    const state = makeState({
      gridFilters: { grades: [], colors: [], rarities: [], query: 'investigate' },
    });
    state.cards[0].oracle_text = 'Whenever a creature you control attacks alone, investigate.';
    applyFilter(state);
    expect(state.filtered.map(c => c.id)).toEqual(['a']);
  });

  it('keeps cards matching the query against oracle text in any case', () => {
    const state = makeState({
      gridFilters: { grades: [], colors: [], rarities: [], query: 'INVESTIGATE' },
    });
    state.cards[0].oracle_text = 'Whenever a creature you control attacks alone, investigate.';
    applyFilter(state);
    expect(state.filtered.map(c => c.id)).toEqual(['a']);
  });

  it('clamps index into the filtered range', () => {
    const state = makeState({ index: 5 });
    applyFilter(state);
    expect(state.index).toBe(2);
  });
});

describe('gridFiltersActive', () => {
  it('is false when every filter is empty', () => {
    expect(gridFiltersActive(makeState())).toBe(false);
  });

  it('is true when a grade chip is active', () => {
    const state = makeState({ gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' } });
    expect(gridFiltersActive(state)).toBe(true);
  });

  it('is true when a search query is present', () => {
    const state = makeState({ gridFilters: { grades: [], colors: [], rarities: [], query: 'lurrus' } });
    expect(gridFiltersActive(state)).toBe(true);
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
    expect(el.gridView.style.display).toBe('block');
    expect(el.gradeView.style.display).toBe('none');
    expect([...el.tabGroup.children].find(b => b.dataset.tab === 'grid').classList.contains('active')).toBe(true);
  });

  it('resets to the start of the filtered list when entering grade with filters active', () => {
    const el = makeEl();
    const state = makeState({
      index: 2,
      tab: 'grid',
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    setTab('grade', state, el);
    expect(state.tab).toBe('grade');
    expect(state.index).toBe(0);
  });

  it('preserves the index when entering grade without filters', () => {
    const el = makeEl();
    const state = makeState({ index: 1, tab: 'grid' });
    setTab('grade', state, el);
    expect(state.index).toBe(1);
  });

  it('honours an explicit index when entering grade with filters active', () => {
    const el = makeEl();
    const state = makeState({
      index: 2,
      tab: 'grid',
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    setTab('grade', state, el, { index: 0 });
    expect(state.index).toBe(0);
  });
});

describe('renderGridView', () => {
  it('opens the clicked card at its filtered position in grade mode', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { a: { grade: 'A' }, c: { grade: 'C' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    renderGridView(state, el);
    const cardBtn = el.gridLanes.querySelector('.lane-card[title="Card A"]');
    cardBtn.click();
    expect(state.tab).toBe('grade');
    expect(state.index).toBe(0);
    expect(el.cardName.textContent).toBe('Card A');
  });

  it('opens the clicked card even when filters exclude other cards', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { a: { grade: 'A' }, c: { grade: 'C' } },
      gridFilters: { grades: ['C'], colors: [], rarities: [], query: '' },
    });
    renderGridView(state, el);
    const cardBtn = el.gridLanes.querySelector('.lane-card[title="Card C"]');
    cardBtn.click();
    expect(state.tab).toBe('grade');
    expect(state.index).toBe(0);
    expect(el.cardName.textContent).toBe('Card C');
  });
});

describe('buildGridFilterBar', () => {
  it('builds a toggle that collapses the filter body', () => {
    const el = makeEl();
    const state = makeState();
    buildGridFilterBar(state, el);
    const toggle = el.gridView.querySelector('.grid-filter-toggle');
    expect(toggle).toBeTruthy();
    expect(el.gridFilters.classList.contains('collapsed')).toBe(true);
    toggle.click();
    expect(el.gridFilters.classList.contains('collapsed')).toBe(false);
    toggle.click();
    expect(el.gridFilters.classList.contains('collapsed')).toBe(true);
  });

  it('places the compare and filter buttons in the same toolbar row', () => {
    const el = makeEl();
    const state = makeState();
    buildGridFilterBar(state, el);
    const toolbar = el.gridView.querySelector('.grid-toolbar');
    const buttons = [...toolbar.children].filter(n => n.tagName === 'BUTTON');
    expect(buttons.some(b => b.classList.contains('compare-btn'))).toBe(true);
    expect(buttons.some(b => b.classList.contains('grid-filter-toggle'))).toBe(true);
  });

  it('keeps the search input always visible above the toolbar, outside the collapsible filter body', () => {
    const el = makeEl();
    const state = makeState();
    buildGridFilterBar(state, el);
    const search = el.gridView.querySelector('.grid-search-row .search-input');
    expect(search).toBeTruthy();
    expect(el.gridFilters.contains(search)).toBe(false);
    expect(el.gridView.querySelector('.grid-search-row').compareDocumentPosition(el.gridView.querySelector('.grid-toolbar')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the filter summary outside the collapsible filter body so it stays visible', () => {
    const el = makeEl();
    const state = makeState();
    buildGridFilterBar(state, el);
    expect(el.gridFilterSummary).toBeTruthy();
    expect(el.gridFilters.contains(el.gridFilterSummary)).toBe(false);
    expect(el.gridView.querySelector('.grid-toolbar').contains(el.gridFilterSummary)).toBe(true);
  });

  it('renders a filter summary that reflects matching card counts', () => {
    const el = makeEl();
    const state = makeState({
      grades: { a: { grade: 'A' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    buildGridFilterBar(state, el);
    expect(el.gridFilterSummary).toBeTruthy();
    renderGridView(state, el);
    expect(el.gridFilterSummary.innerHTML).toBe('<strong>1</strong> / 3 cards match');
  });

  it('shows the total card count when no filters are active', () => {
    const el = makeEl();
    const state = makeState();
    buildGridFilterBar(state, el);
    renderGridView(state, el);
    expect(el.gridFilterSummary.innerHTML).toBe('<strong>3</strong> cards');
  });
});

describe('toggleGridChip', () => {
  function gradeChipA(el) {
    return el.gridFilters.querySelector('button.chip[data-group="grades"][data-value="A"]');
  }

  it('adds a chip value and marks the button active', () => {
    const el = makeEl();
    const state = makeState();
    const chip = gradeChipA(el);
    toggleGridChip(state, el, chip);
    expect(state.gridFilters.grades).toEqual(['A']);
    expect(chip.classList.contains('active')).toBe(true);
  });

  it('removes a chip value on second toggle', () => {
    const el = makeEl();
    const state = makeState({ gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' } });
    const chip = gradeChipA(el);
    toggleGridChip(state, el, chip);
    expect(state.gridFilters.grades).toEqual([]);
    expect(chip.classList.contains('active')).toBe(false);
  });
});

describe('syncGridChips', () => {
  it('synchronises the active class with the state', () => {
    const el = makeEl();
    const state = makeState({ gridFilters: { grades: ['A'], colors: ['W'], rarities: [], query: '' } });
    syncGridChips(state, el);
    const chips = [...el.gridFilters.querySelectorAll('button.chip')];
    expect(chips.find(c => c.dataset.group === 'grades' && c.dataset.value === 'A').classList.contains('active')).toBe(true);
    expect(chips.find(c => c.dataset.group === 'colors' && c.dataset.value === 'W').classList.contains('active')).toBe(true);
    expect(chips.find(c => c.dataset.group === 'rarities').classList.contains('active')).toBe(false);
  });
});

describe('resetGridFilters', () => {
  it('clears filters and the search input', () => {
    const el = makeEl();
    el.gridSearch.value = 'lurrus';
    const state = makeState({
      gridFilters: { grades: ['A'], colors: ['W'], rarities: ['rare'], query: 'lurrus' },
    });
    resetGridFilters(state, el);
    expect(state.gridFilters).toEqual({ grades: [], colors: [], rarities: [], query: '' });
    expect(el.gridSearch.value).toBe('');
  });
});

describe('render', () => {
  it('shows the empty message for an empty card set', () => {
    const el = makeEl();
    const state = makeState({ cards: [] });
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

describe('comparison rendering', () => {
  function makeActualGrades() {
    return {
      byName: {
        'Card A': { all: { grade: 'A', winrate: 0.6, gameCount: 800, score: 96 } },
        'Card B': { all: { grade: 'C', winrate: 0.5, gameCount: 800, score: 50 } },
        'Card C': { all: { grade: 'D-', winrate: 0.45, gameCount: 800, score: 18 } },
      },
    };
  }

  function badgeFor(el, cardName) {
    return [...el.gridLanes.querySelectorAll('.lane-card')].find(b => b.title === cardName);
  }

  it('shows a match badge when the own grade matches the bucketed actual grade', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { a: { grade: 'A' } },
      actualGrades: makeActualGrades(),
      compareActive: true,
    });
    renderGridView(state, el);
    const btn = badgeFor(el, 'Card A');
    expect(btn.querySelector('.cmp-badge').textContent).toBe('A');
    expect(btn.querySelector('.cmp-badge').classList.contains('cmp-match')).toBe(true);
    expect(btn.classList.contains('cmp-over')).toBe(false);
  });

  it('flags the card as overrated when the own grade is higher than the data', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { b: { grade: 'A' } },
      actualGrades: makeActualGrades(),
      compareActive: true,
    });
    renderGridView(state, el);
    const btn = badgeFor(el, 'Card B');
    expect(btn.querySelector('.cmp-badge').textContent).toBe('↑ C');
    expect(btn.classList.contains('cmp-over')).toBe(true);
  });

  it('flags the card as underrated when the own grade is lower than the data', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { c: { grade: 'E' } },
      actualGrades: makeActualGrades(),
      compareActive: true,
    });
    renderGridView(state, el);
    const btn = badgeFor(el, 'Card C');
    expect(btn.querySelector('.cmp-badge').textContent).toBe('↓ D-');
    expect(btn.classList.contains('cmp-under')).toBe(true);
  });

  it('hides badges when comparison is off', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { a: { grade: 'A' } },
      actualGrades: makeActualGrades(),
      compareActive: false,
    });
    renderGridView(state, el);
    expect(el.gridLanes.querySelectorAll('.cmp-badge')).toHaveLength(0);
  });

  it('renders an empty summary when comparison is off', () => {
    const el = makeEl();
    const state = makeState({});
    renderCompareSummary(state, el);
    expect(el.compareSummary.style.display).toBe('none');
  });

  it('summarises match, over, and under counts across graded cards', () => {
    const el = makeEl();
    const state = makeState({
      grades: { a: { grade: 'A' }, b: { grade: 'A' }, c: { grade: 'E' } },
      actualGrades: makeActualGrades(),
      compareActive: true,
    });
    renderCompareSummary(state, el);
    expect(el.compareSummary.style.display).toBe('flex');
    expect(el.compareSummary.textContent).toContain('3 graded cards compared');
    expect(el.compareSummary.textContent).toContain('1 match');
    expect(el.compareSummary.textContent).toContain('1 overrated');
    expect(el.compareSummary.textContent).toContain('1 underrated');
  });

  it('counts graded cards without a 17Lands grade separately', () => {
    const el = makeEl();
    const state = makeState({
      grades: { a: { grade: 'A' } },
      actualGrades: { byName: { 'Something Else': { all: { grade: 'A' } } } },
      compareActive: true,
    });
    renderCompareSummary(state, el);
    expect(el.compareSummary.textContent).toContain('0 graded cards compared');
    expect(el.compareSummary.textContent).toContain('1 no 17Lands grade');
  });

  it('renders All/Match/Overrated/Underrated/Strong filter chips', () => {
    const el = makeEl();
    const state = makeState({ actualGrades: makeActualGrades(), compareActive: true });
    renderCompareSummary(state, el);
    const chips = [...el.compareSummary.querySelectorAll('.cmp-filter-chip')].map(c => c.dataset.cmp);
    expect(chips).toEqual(['all', 'match', 'over', 'under', 'strong-over', 'strong-under']);
    expect(el.compareSummary.querySelector('.cmp-filter-chip[data-cmp="all"]').classList.contains('active')).toBe(true);
  });

  it('marks the active filter chip', () => {
    const el = makeEl();
    const state = makeState({
      actualGrades: makeActualGrades(),
      compareActive: true,
      compareFilter: 'over',
    });
    renderCompareSummary(state, el);
    expect(el.compareSummary.querySelector('.cmp-filter-chip[data-cmp="over"]').classList.contains('active')).toBe(true);
    expect(el.compareSummary.querySelector('.cmp-filter-chip[data-cmp="all"]').classList.contains('active')).toBe(false);
  });

  it('matches multi-face cards by the 17Lands name', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      cards: [
        { id: 'p', name: 'Elite Interceptor // Rejoinder', layout: 'prepare', rarity: 'common', type_line: 'Creature', colors: ['W'], card_faces: [{ name: 'Elite Interceptor', image_uris: { normal: 'p.jpg' } }], image_uris: { normal: 'p.jpg' } },
        { id: 's', name: 'Dazzling Theater // Prop Room', layout: 'split', rarity: 'rare', type_line: 'Sorcery', colors: ['R'], card_faces: [{ name: 'Dazzling Theater' }, { name: 'Prop Room' }], image_uris: { normal: 's.jpg' } },
      ],
      grades: { p: { grade: 'A' }, s: { grade: 'A' } },
      actualGrades: {
        byName: {
          'Elite Interceptor': { all: { grade: 'B+', winrate: 0.59, gameCount: 172182, score: 88 } },
          'Dazzling Theater // Prop Room': { all: { grade: 'F', winrate: 0.42, gameCount: 900, score: 0 } },
        },
      },
      compareActive: true,
    });
    renderGridView(state, el);
    const adventureBadge = badgeFor(el, 'Elite Interceptor // Rejoinder').querySelector('.cmp-badge');
    expect(adventureBadge.textContent).toContain('B+');
    const splitBadge = badgeFor(el, 'Dazzling Theater // Prop Room').querySelector('.cmp-badge');
    expect(splitBadge.textContent).toContain('F');
  });

  it('filters lanes by comparison status', () => {
    const el = makeEl();
    const base = {
      grades: { a: { grade: 'A' }, b: { grade: 'A' }, c: { grade: 'E' } },
      actualGrades: makeActualGrades(),
      compareActive: true,
    };

    let state = makeState({ ...base, compareFilter: 'over' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card B']);

    state = makeState({ ...base, compareFilter: 'under' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card C']);

    state = makeState({ ...base, compareFilter: 'match' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card A']);

    state = makeState({ ...base, compareFilter: null });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')]).toHaveLength(3);
  });

  it('filters lanes into strong over/under when grades differ by 2 or more', () => {
    const el = makeEl();
    const actualGrades = {
      byName: {
        'Card A': { all: { grade: 'A', winrate: 0.6, gameCount: 800, score: 96 } },
        'Card B': { all: { grade: 'C', winrate: 0.5, gameCount: 800, score: 50 } },
        'Card C': { all: { grade: 'D-', winrate: 0.45, gameCount: 800, score: 18 } },
        'Card D': { all: { grade: 'B', winrate: 0.55, gameCount: 800, score: 70 } },
      },
    };
    const base = {
      cards: [
        { id: 'a', name: 'Card A', rarity: 'rare', type_line: 'Creature', image_uris: { normal: 'a.jpg' } },
        { id: 'b', name: 'Card B', rarity: 'common', type_line: 'Land', image_uris: { normal: 'b.jpg' } },
        { id: 'c', name: 'Card C', rarity: 'rare', type_line: 'Instant', image_uris: { normal: 'c.jpg' } },
        { id: 'd', name: 'Card D', rarity: 'common', type_line: 'Sorcery', image_uris: { normal: 'd.jpg' } },
      ],
      grades: { a: { grade: 'A' }, b: { grade: 'A' }, c: { grade: 'E' }, d: { grade: 'E' } },
      actualGrades,
      compareActive: true,
    };

    let state = makeState({ ...base, compareFilter: 'strong-over' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card B']);

    state = makeState({ ...base, compareFilter: 'strong-under' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card D']);

    state = makeState({ ...base, compareFilter: 'over' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card B']);

    state = makeState({ ...base, compareFilter: 'under' });
    renderGridView(state, el);
    expect([...el.gridLanes.querySelectorAll('.lane-card')].map(b => b.title)).toEqual(['Card C', 'Card D']);
  });

  it('treats gridFiltersActive as on when a comparison filter is set', () => {
    expect(gridFiltersActive(makeState({ compareActive: true, compareFilter: 'over' }))).toBe(true);
    expect(gridFiltersActive(makeState({ compareActive: true }))).toBe(false);
    expect(gridFiltersActive(makeState({ compareFilter: 'over' }))).toBe(false);
  });
});
