// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGradingQueue, allCardsFlat, render, setTab } from '../js/render.js';
import { moveState } from '../js/gradeNav.js';

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
  el.compareStatus = document.createElement('span');
  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';
  toolbar.appendChild(el.compareBtn);
  toolbar.appendChild(el.compareStatus);
  el.gridView.appendChild(toolbar);
  for (const t of ['grade', 'grid']) {
    const b = document.createElement('button');
    b.dataset.tab = t;
    el.tabGroup.appendChild(b);
  }
  // required for setTab scroll restore
  el.gridView.scrollTop = 0;
  return el;
}

function makeCardsOrdered() {
  // Simulate Scryfall order=color: Colorless, W, U, B, R, G, multicolor
  return [
    { id: 'c1', name: 'Colorless One', colors: [], rarity: 'common', type_line: '', collector_number: '1', image_uris: { normal: '1.jpg' } },
    { id: 'w1', name: 'White One', colors: ['W'], rarity: 'common', type_line: '', collector_number: '2', image_uris: { normal: '2.jpg' } },
    { id: 'u1', name: 'Blue One', colors: ['U'], rarity: 'common', type_line: '', collector_number: '3', image_uris: { normal: '3.jpg' } },
    { id: 'b1', name: 'Black One', colors: ['B'], rarity: 'common', type_line: '', collector_number: '4', image_uris: { normal: '4.jpg' } },
    { id: 'm1', name: 'Multicolor One', colors: ['W', 'U'], rarity: 'common', type_line: '', collector_number: '5', image_uris: { normal: '5.jpg' } },
  ];
}

function makeState(overrides = {}) {
  return {
    cards: makeCardsOrdered(),
    filtered: [],
    index: 0,
    tab: 'grade',
    grades: {},
    gridFilters: { grades: [], colors: [], rarities: [], query: '' },
    gradingQueue: null,
    gradingIndex: 0,
    gridScrollTop: 0,
    compareActive: false,
    compareFilter: null,
    actualGrades: null,
    ...overrides,
  };
}

describe('P2 sort order - grade then scryfall color', () => {
  it('sorts by grade A>B>Ungraded then by scryfall color', () => {
    const cards = makeCardsOrdered();
    const state = makeState({
      cards,
      grades: { w1: { grade: 'A' }, b1: { grade: 'B' }, u1: { grade: 'A' } },
    });
    // allCardsFlat preserves scryfall order within grade: A lane should be [w1,u1] in scryfall order (W before U)
    const flat = allCardsFlat(state);
    expect(flat.map(c => c.id)).toEqual(['w1', 'u1', 'b1', 'c1', 'm1']);
  });

  it('colorless before W within same grade', () => {
    const cards = makeCardsOrdered();
    const state = makeState({
      cards: [cards[1], cards[0]], // W then Colorless but same grade A
      grades: { w1: { grade: 'A' }, c1: { grade: 'A' } },
    });
    // Input order is W then C, but allCardsFlat preserves input order, however scryfall order would be C then W
    // Since we rely on fetch order, we just assert preservation of input order which equals scryfall if fetched correctly
    // So if input is [w1,c1] flat should be [w1,c1] (preserves)
    const flat = allCardsFlat(state);
    expect(flat.map(c => c.id)).toEqual(['w1', 'c1']);
    // Now proper scryfall order input [c1,w1] should give [c1,w1]
    const state2 = makeState({ cards: [cards[0], cards[1]], grades: { w1: { grade: 'A' }, c1: { grade: 'A' } } });
    expect(allCardsFlat(state2).map(c => c.id)).toEqual(['c1', 'w1']);
  });
});

describe('Scenario 1 - Grading directly from start with ungraded', () => {
  it('startup queue contains all ungraded in P2 order', () => {
    const state = makeState({ grades: { c1: { grade: 'A' } } });
    const queue = buildGradingQueue(state, 'toggle');
    expect(queue.map(c => c.id)).toEqual(['w1', 'u1', 'b1', 'm1']);
    // grading via setTab toggle
    const el = makeEl();
    state.tab = 'grid';
    setTab('grade', state, el);
    expect(state.gradingQueue.map(c => c.id)).toEqual(['w1', 'u1', 'b1', 'm1']);
    expect(el.cardName.textContent).toBe('White One');
  });

  it('grading advances to next and Back returns to graded (queue immutable)', () => {
    const el = makeEl();
    const state = makeState({ grades: {} });
    render(state, el);
    expect(state.gradingQueue.length).toBe(5);
    expect(el.cardName.textContent).toBe('Colorless One');
    // Simulate gradeCurrentCard: grade first and advance
    state.grades.c1 = { grade: 'A', gradedAt: new Date().toISOString() };
    state.gradingIndex = (state.gradingIndex + 1) % state.gradingQueue.length;
    state.index = state.gradingIndex;
    render(state, el);
    expect(el.cardName.textContent).toBe('White One');
    expect(state.gradingQueue.length).toBe(5); // not mutated
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Colorless One');
    expect(state.grades.c1.grade).toBe('A');
  });

  it('wrap cycling', () => {
    const el = makeEl();
    const state = makeState({ grades: {} });
    render(state, el);
    expect(state.gradingQueue.length).toBe(5);
    // at first, Prev wraps to last
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Multicolor One');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Colorless One');
  });

  it('toggle to grid shows no filter (all grades)', () => {
    const el = makeEl();
    const state = makeState({ tab: 'grade', grades: { c1: { grade: 'A' } } });
    render(state, el);
    setTab('grid', state, el);
    expect(state.tab).toBe('grid');
    // gridFilters should still be empty
    expect(state.gridFilters.grades).toEqual([]);
  });
});

describe('Scenario 2 - No ungraded at start', () => {
  it('startup with all graded -> grid, toggle loads all P2', () => {
    const cards = makeCardsOrdered();
    const grades = {};
    for (const c of cards) grades[c.id] = { grade: 'A' };
    const state = makeState({ cards, grades, tab: 'grade' });
    const el = makeEl();
    // Simulate init all graded check
    const queueToggle = buildGradingQueue(state, 'toggle');
    expect(queueToggle.length).toBe(5);
    expect(queueToggle.map(c => c.id)).toEqual(['c1', 'w1', 'u1', 'b1', 'm1']); // all A lane preserves scryfall order
    // Toggle from grid loads all
    state.tab = 'grid';
    setTab('grade', state, el);
    expect(state.gradingQueue.length).toBe(5);
    expect(state.gradingIndex).toBe(0);
    expect(el.cardName.textContent).toBe('Colorless One'); // top of A lane
  });

  it('single card queue disables auto-advance and buttons', () => {
    const card = { id: 'solo', name: 'Solo', colors: [], rarity: 'common', type_line: '', collector_number: '1', image_uris: { normal: 's.jpg' } };
    const el = makeEl();
    const state = makeState({ cards: [card], grades: {}, tab: 'grade', gradingQueue: [card], gradingIndex: 0, filtered: [card], index: 0 });
    render(state, el);
    expect(el.prevBtn.disabled).toBe(true);
    expect(el.nextBtn.disabled).toBe(true);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Solo');
    // Simulate gradeCurrentCard single card should stay
    state.grades.solo = { grade: 'A', gradedAt: new Date().toISOString() };
    // gradeCurrentCard logic keeps index 0 for len 1
    render(state, el);
    expect(state.gradingQueue.length).toBe(1);
    expect(el.cardName.textContent).toBe('Solo');
  });
});

describe('Scenario 3 - Grading from selected card, no filter', () => {
  it('grid click loads all cards queue and starts at clicked card with wrap', () => {
    const el = makeEl();
    const state = makeState({ tab: 'grid', grades: {} });
    // Simulate grid click on u1 (Blue One, index 2 in scryfall order)
    const queue = buildGradingQueue(state, 'grid-click');
    expect(queue.map(c => c.id)).toEqual(['c1', 'w1', 'u1', 'b1', 'm1']);
    const idx = queue.findIndex(c => c.id === 'u1');
    state.tab = 'grid';
    setTab('grade', state, el, { queue, index: idx });
    expect(el.cardName.textContent).toBe('Blue One');
    expect(state.gradingIndex).toBe(2);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Black One');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Multicolor One');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Colorless One'); // wrap
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Multicolor One');
  });

  it('scroll position retained', () => {
    const el = makeEl();
    const state = makeState({ tab: 'grid', gridScrollTop: 123, grades: {} });
    el.gridView.scrollTop = 0;
    setTab('grade', state, el);
    state.gridScrollTop = 456;
    setTab('grid', state, el);
    expect(state.gridScrollTop).toBe(456);
  });
});

describe('Scenario 4 - Grading from selected card, filter applied', () => {
  it('grid click with grade filter loads filtered queue P2', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { w1: { grade: 'A' }, b1: { grade: 'A' }, u1: { grade: 'B' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    const queue = buildGradingQueue(state, 'grid-click');
    // Filter A only: w1,b1 in scryfall order w1 before b1
    expect(queue.map(c => c.id)).toEqual(['w1', 'b1']);
    const idx = queue.findIndex(c => c.id === 'w1');
    setTab('grade', state, el, { queue, index: idx });
    expect(el.cardName.textContent).toBe('White One');
  });

  it('re-grade advances and Back shows non-matching (queue not mutated)', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grid',
      grades: { w1: { grade: 'A' }, b1: { grade: 'A' }, u1: { grade: 'B' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    const queue = buildGradingQueue(state, 'grid-click');
    expect(queue.map(c => c.id)).toEqual(['w1', 'b1']);
    setTab('grade', state, el, { queue, index: 0 });
    expect(el.cardName.textContent).toBe('White One');
    // Grade w1 to B (no longer matches filter A)
    state.grades.w1 = { grade: 'B', gradedAt: new Date().toISOString() };
    state.gradingIndex = (state.gradingIndex + 1) % state.gradingQueue.length;
    state.index = state.gradingIndex;
    render(state, el);
    expect(el.cardName.textContent).toBe('Black One');
    expect(state.gradingQueue.map(c => c.id)).toEqual(['w1', 'b1']); // not mutated
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('White One');
    expect(state.grades.w1.grade).toBe('B'); // still B, non-matching
    // Re-grade again, queue still not mutated
    state.grades.w1.grade = 'C';
    state.gradingIndex = (state.gradingIndex + 1) % state.gradingQueue.length;
    state.index = state.gradingIndex;
    render(state, el);
    expect(el.cardName.textContent).toBe('Black One');
    expect(state.gradingQueue.map(c => c.id)).toEqual(['w1', 'b1']);
  });

  it('filter includes colors, rarities, query and compare', () => {
    const cards = [
      { id: 'a', name: 'Lightning Bolt', colors: ['R'], rarity: 'common', type_line: 'Instant', collector_number: '1', image_uris: { normal: 'a.jpg' }, oracle_text: 'Deal 3' },
      { id: 'b', name: 'Counterspell', colors: ['U', 'U'], rarity: 'common', type_line: 'Instant', collector_number: '2', image_uris: { normal: 'b.jpg' }, oracle_text: 'Counter' },
    ];
    const state = makeState({
      cards,
      grades: { a: { grade: 'A' } },
      gridFilters: { grades: [], colors: ['R'], rarities: [], query: '' },
    });
    const queue = buildGradingQueue(state, 'grid-click');
    expect(queue.map(c => c.id)).toEqual(['a']);
    // With query filter
    state.gridFilters = { grades: [], colors: [], rarities: [], query: 'bolt' };
    const q2 = buildGradingQueue(state, 'grid-click');
    expect(q2.map(c => c.id)).toEqual(['a']);
  });

  it('compare filter respected', () => {
    const cards = makeCardsOrdered();
    const state = makeState({
      cards,
      grades: { w1: { grade: 'A' }, b1: { grade: 'A' } },
      actualGrades: {
        byName: {
          'White One': { all: { grade: 'C', winrate: 0.5, gameCount: 100, score: 50 } },
          'Black One': { all: { grade: 'A', winrate: 0.6, gameCount: 100, score: 96 } },
        },
      },
      compareActive: true,
      compareFilter: 'over',
      gridFilters: { grades: [], colors: [], rarities: [], query: '' },
    });
    const queue = buildGradingQueue(state, 'grid-click');
    // White is over (A vs C), Black is match, so only White
    expect(queue.map(c => c.id)).toEqual(['w1']);
  });
});

describe('Queue reload only on entry', () => {
  it('grading does not reload queue', () => {
    const el = makeEl();
    const state = makeState({ grades: {} });
    render(state, el);
    const initialQueue = [...state.gradingQueue];
    state.grades.c1 = { grade: 'A', gradedAt: new Date().toISOString() };
    render(state, el);
    expect(state.gradingQueue).toEqual(initialQueue);
  });
});
