// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { moveState, handleGradeKeydown } from '../js/gradeNav.js';
import { render, buildGradingQueue } from '../js/render.js';

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
  for (const g of ['A', 'B', 'C', 'D', 'E']) {
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
  return el;
}

function makeCards() {
  return [
    { id: 'a', name: 'Card A', rarity: 'rare', type_line: 'Creature', collector_number: '1', image_uris: { normal: 'a.jpg' } },
    { id: 'b', name: 'Card B', rarity: 'common', type_line: 'Land', collector_number: '2', image_uris: { normal: 'b.jpg' } },
    { id: 'c', name: 'Card C', rarity: 'rare', type_line: 'Instant', collector_number: '3', image_uris: { normal: 'c.jpg' } },
    { id: 'd', name: 'Card D', rarity: 'mythic', type_line: 'Sorcery', collector_number: '4', image_uris: { normal: 'd.jpg' } },
  ];
}

function makeState(overrides = {}) {
  return {
    cards: makeCards(),
    filtered: [],
    index: 0,
    tab: 'grade',
    grades: {},
    gridFilters: { grades: [], colors: [], rarities: [], query: '' },
    gradingQueue: null,
    gradingIndex: 0,
    ...overrides,
  };
}

describe('moveState in grade mode with grading queue (wrap cycling)', () => {
  it('Prev from first wraps to last and Next from last wraps to first', () => {
    const el = makeEl();
    const state = makeState({ grades: {} });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    expect(state.gradingQueue.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card D');
    expect(state.gradingIndex).toBe(3);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card A');
    expect(state.gradingIndex).toBe(0);
  });

  it('Prev and Next cycle through ungraded queue', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' }, b: { grade: 'B' } } });
    render(state, el);
    // Toggle queue is ungraded only [c,d]
    expect(state.gradingQueue.map(c => c.id)).toEqual(['c', 'd']);
    expect(el.cardName.textContent).toBe('Card C');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card D');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card C'); // wrap
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card D');
  });

  it('single-card queue does not move', () => {
    const el = makeEl();
    const cards = [{ id: 'x', name: 'Solo', rarity: 'common', type_line: 'Creature', collector_number: '1', image_uris: { normal: 'x.jpg' } }];
    const state = makeState({ cards, grades: {}, gradingQueue: cards, gradingIndex: 0, filtered: cards, index: 0 });
    render(state, el);
    expect(el.cardName.textContent).toBe('Solo');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Solo');
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Solo');
  });

  it('grading does not mutate queue — back shows just-graded card', () => {
    const el = makeEl();
    const state = makeState({ grades: {} });
    render(state, el);
    expect(state.gradingQueue.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
    // Simulate grading Card A (index 0) via gradeCurrentCard logic: advance to next
    state.grades.a = { grade: 'A', gradedAt: new Date().toISOString() };
    // Auto-advance as gradeCurrentCard does
    state.gradingIndex = (state.gradingIndex + 1) % state.gradingQueue.length;
    state.index = state.gradingIndex;
    render(state, el);
    expect(el.cardName.textContent).toBe('Card B');
    // Queue stays same even though A now graded
    expect(state.gradingQueue.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card A');
    expect(state.grades.a.grade).toBe('A');
    // Re-grade same card, queue still not mutated
    state.grades.a.grade = 'B';
    // gradeCurrentCard would advance again
    state.gradingIndex = (state.gradingIndex + 0) % state.gradingQueue.length; // stay at A then advance simulated as if re-graded from A
    // Actually from A, next is B
    state.gradingIndex = 0;
    state.index = 0;
    render(state, el);
    // Now grade A again to B and advance
    state.grades.a.grade = 'C';
    state.gradingIndex = (0 + 1) % state.gradingQueue.length;
    state.index = state.gradingIndex;
    render(state, el);
    expect(el.cardName.textContent).toBe('Card B');
    expect(state.gradingQueue.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Next steps sequentially and wraps', () => {
    const el = makeEl();
    const state = makeState({ grades: {} });
    render(state, el);
    moveState(state, el, 1, render); // to b
    expect(el.cardName.textContent).toBe('Card B');
    moveState(state, el, 1, render); // to c
    expect(el.cardName.textContent).toBe('Card C');
    moveState(state, el, 1, render); // to d
    expect(el.cardName.textContent).toBe('Card D');
    moveState(state, el, 1, render); // wrap to a
    expect(el.cardName.textContent).toBe('Card A');
  });
});

describe('moveState with filters active or grid tab (filtered navigation)', () => {
  it('moves within filtered when grid filters active', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grade',
      grades: { a: { grade: 'A' }, c: { grade: 'C' } },
      gridFilters: { grades: ['A', 'C'], colors: [], rarities: [], query: '' },
    });
    render(state, el);
    expect(state.filtered.map(c => c.id)).toEqual(['a', 'c']);
    expect(el.cardName.textContent).toBe('Card A');
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card C');
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card A');
  });

  it('moves within filtered in grid tab', () => {
    const el = makeEl();
    const state = makeState({ tab: 'grid', grades: {}, index: 0 });
    render(state, el);
    moveState(state, el, 1, render);
    expect(state.index).toBe(1);
    expect(state.filtered[state.index].name).toBe('Card B');
  });

  it('wraps in filtered mode when queue is set from filter', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grade',
      grades: { a: { grade: 'A' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
    });
    // Build explicit queue via buildGradingQueue grid-click
    const queue = buildGradingQueue(state, 'grid-click');
    expect(queue.map(c => c.id)).toEqual(['a']);
    // Single queue: no move
    state.gradingQueue = queue;
    state.gradingIndex = 0;
    state.filtered = queue;
    state.index = 0;
    render(state, el);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card A');
  });
});

describe('moveState grading button colours reset on transition to next card', () => {
  function activeGrades(el) {
    return [...el.gradeRow.children].filter(b => b.classList.contains('active')).map(b => b.dataset.grade);
  }

  it('resets colours when moving to next in queue wraps', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } } });
    render(state, el);
    // Queue is [b,c,d], first is B ungraded
    expect(el.cardName.textContent).toBe('Card B');
    expect(activeGrades(el)).toEqual([]);
    // Simulate gradingQueue containing a graded card as first element via explicit queue
    // Create a queue that starts with graded A for this test
    const customQueue = [state.cards[0], state.cards[1], state.cards[2]];
    state.gradingQueue = customQueue;
    state.gradingIndex = 0;
    state.filtered = customQueue;
    state.index = 0;
    render(state, el);
    expect(activeGrades(el)).toEqual(['A']);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card B');
    expect(activeGrades(el)).toEqual([]);
  });

  it('shows new graded colour when moving to a graded card via queue', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' }, b: { grade: 'C' } } });
    // toggle with some ungraded gives [c,d] not [a,b,c,d], so create custom queue for graded navigation
    const customQueue = makeCards(); // [a,b,c,d] includes graded a,b
    state.gradingQueue = customQueue;
    state.gradingIndex = 2;
    state.filtered = customQueue;
    state.index = 2;
    render(state, el);
    expect(el.cardName.textContent).toBe('Card C');
    expect(activeGrades(el)).toEqual([]);
    // Move uses queue, test moving backward to graded B
    state.gradingIndex = 1;
    state.index = 1;
    render(state, el);
    expect(el.cardName.textContent).toBe('Card B');
    expect(activeGrades(el)).toEqual(['C']);
    state.gradingIndex = 0;
    state.index = 0;
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    expect(activeGrades(el)).toEqual(['A']);
  });

  it('resets colours when moving forward through ungraded cards (no stale grade)', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } } });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card B');
    expect(activeGrades(el)).toEqual([]);
    el.gradeRow.children[0].classList.add('active');
    expect(activeGrades(el)).toEqual(['A']);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card C');
    expect(activeGrades(el)).toEqual([]);
  });

  it('resets colours when moving in filtered mode to ungraded card', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grade',
      grades: { a: { grade: 'A' } },
      gridFilters: { grades: ['A', 'ungraded'], colors: [], rarities: [], query: '' },
    });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    expect(activeGrades(el)).toEqual(['A']);
    moveState(state, el, 1, render);
    expect(activeGrades(el)).toEqual([]);
  });

  it('transitions from graded to graded via filtered navigation shows correct grade', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grade',
      grades: { a: { grade: 'A' }, c: { grade: 'B' } },
      gridFilters: { grades: ['A', 'B'], colors: [], rarities: [], query: '' },
    });
    render(state, el);
    expect(activeGrades(el)).toEqual(['A']);
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card C');
    expect(activeGrades(el)).toEqual(['B']);
  });

  it('wraps when at bounds instead of staying', () => {
    const el = makeEl();
    const state = makeState({ grades: {}, index: 0 });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card D'); // wrap
    moveState(state, el, 1, render);
    expect(el.cardName.textContent).toBe('Card A'); // wrap back
  });

  it('resets via explicit resetGradeButtons before render even with stale state', async () => {
    const { resetGradeButtons } = await import('../js/render.js');
    const el = makeEl();
    for (const b of el.gradeRow.children) b.classList.add('active');
    resetGradeButtons(el);
    expect(activeGrades(el)).toEqual([]);
  });
});

describe('handleGradeKeydown', () => {
  function makeEvent(key, opts = {}) {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
    Object.defineProperty(e, 'key', { value: key });
    return e;
  }

  it('calls gradeFn for A-E keys in grade tab', () => {
    const state = makeState({ tab: 'grade' });
    const gradeFn = vi.fn();
    const moveFn = vi.fn();
    const e = makeEvent('b');
    const preventSpy = vi.spyOn(e, 'preventDefault');
    const handled = handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(handled).toBe(true);
    expect(gradeFn).toHaveBeenCalledWith('B');
    expect(preventSpy).toHaveBeenCalled();
  });

  it('calls moveFn for ArrowLeft/ArrowUp and ArrowRight/ArrowDown', () => {
    const state = makeState({ tab: 'grade' });
    const gradeFn = vi.fn();
    const moveFn = vi.fn();
    let e = makeEvent('ArrowLeft');
    handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(moveFn).toHaveBeenCalledWith(-1);
    moveFn.mockClear();
    e = makeEvent('ArrowUp');
    handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(moveFn).toHaveBeenCalledWith(-1);
    moveFn.mockClear();
    e = makeEvent('ArrowRight');
    handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(moveFn).toHaveBeenCalledWith(1);
    moveFn.mockClear();
    e = makeEvent('ArrowDown');
    handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(moveFn).toHaveBeenCalledWith(1);
  });

  it('ignores keys when not in grade tab', () => {
    const state = makeState({ tab: 'grid' });
    const gradeFn = vi.fn();
    const moveFn = vi.fn();
    const e = makeEvent('a');
    const handled = handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(handled).toBe(false);
    expect(gradeFn).not.toHaveBeenCalled();
  });

  it('ignores keys when activeElement is INPUT', () => {
    const state = makeState({ tab: 'grade' });
    const gradeFn = vi.fn();
    const moveFn = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const e = makeEvent('a');
    const handled = handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(handled).toBe(false);
    expect(gradeFn).not.toHaveBeenCalled();
    input.remove();
  });

  it('ignores non-grade, non-arrow keys', () => {
    const state = makeState({ tab: 'grade' });
    const gradeFn = vi.fn();
    const moveFn = vi.fn();
    const e = makeEvent('x');
    const handled = handleGradeKeydown(e, state, gradeFn, moveFn);
    expect(handled).toBe(false);
    expect(gradeFn).not.toHaveBeenCalled();
    expect(moveFn).not.toHaveBeenCalled();
  });

  it('returns false when defaultPrevented', () => {
    const state = makeState({ tab: 'grade' });
    const e = makeEvent('a');
    e.preventDefault();
    Object.defineProperty(e, 'defaultPrevented', { value: true });
    const handled = handleGradeKeydown(e, state, vi.fn(), vi.fn());
    expect(handled).toBe(false);
  });
});
