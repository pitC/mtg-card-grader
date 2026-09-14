// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { moveState, handleGradeKeydown } from '../js/gradeNav.js';
import { render } from '../js/render.js';

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
    _forcedGradeCardId: null,
    ...overrides,
  };
}

describe('moveState in grade mode without filters (base-order navigation)', () => {
  it('Prev from first ungraded after grading goes back to graded via forced', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } } });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card B');
    expect(state.filtered.map(c => c.id)).toEqual(['b', 'c', 'd']);
    moveState(state, el, -1, render);
    expect(state._forcedGradeCardId).toBe('a');
    expect(el.cardName.textContent).toBe('Card A');
    expect(state.filtered.map(c => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Prev walks back through multiple graded cards', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' }, b: { grade: 'B' } } });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card C');
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card B');
    expect(state._forcedGradeCardId).toBe('b');
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card A');
    expect(state._forcedGradeCardId).toBe('a');
  });

  it('Next from forced graded to ungraded clears forced and sets index', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } }, _forcedGradeCardId: 'a' });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    moveState(state, el, 1, render);
    expect(state._forcedGradeCardId == null || state._forcedGradeCardId === undefined).toBe(true);
    expect(el.cardName.textContent).toBe('Card B');
    // Should be at ungraded index 0 (Card B)
    expect(state.index).toBe(0);
  });

  it('Next steps sequentially through graded and ungraded', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } }, _forcedGradeCardId: 'a' });
    render(state, el);
    moveState(state, el, 1, render); // to b
    expect(el.cardName.textContent).toBe('Card B');
    moveState(state, el, 1, render); // to c
    expect(el.cardName.textContent).toBe('Card C');
    moveState(state, el, 1, render); // to d
    expect(el.cardName.textContent).toBe('Card D');
  });

  it('does nothing at bounds', () => {
    const el = makeEl();
    const state = makeState({ grades: {}, index: 0 });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card A');
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card A');
    const lastState = makeState({ grades: {}, index: 3 });
    render(lastState, el);
    expect(el.cardName.textContent).toBe('Card D');
    moveState(lastState, el, 1, render);
    expect(el.cardName.textContent).toBe('Card D');
  });

  it('after grading, Prev is enabled and can return then re-grade advances to next ungraded', () => {
    const el = makeEl();
    const state = makeState({ grades: { a: { grade: 'A' } } });
    render(state, el);
    expect(el.cardName.textContent).toBe('Card B');
    // Simulate grading B
    state.grades.b = { grade: 'C', gradedAt: new Date().toISOString() };
    if (state._forcedGradeCardId) delete state._forcedGradeCardId;
    render(state, el);
    expect(el.cardName.textContent).toBe('Card C');
    // Prev should go back to B (graded)
    moveState(state, el, -1, render);
    expect(el.cardName.textContent).toBe('Card B');
    expect(state._forcedGradeCardId).toBe('b');
    // Re-grade B with different grade – mimics gradeCurrentCard clearing forced
    state.grades.b.grade = 'D';
    delete state._forcedGradeCardId;
    render(state, el);
    // Should now be at next ungraded C
    expect(el.cardName.textContent).toBe('Card C');
    expect(state.filtered.map(c => c.id)).toEqual(['c', 'd']);
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
    expect(state._forcedGradeCardId == null).toBe(true);
  });

  it('moves within filtered in grid tab', () => {
    const el = makeEl();
    const state = makeState({ tab: 'grid', grades: {}, index: 0 });
    render(state, el);
    moveState(state, el, 1, render);
    expect(state.index).toBe(1);
    expect(state.filtered[state.index].name).toBe('Card B');
  });

  it('clears forced when moving in filtered mode', () => {
    const el = makeEl();
    const state = makeState({
      tab: 'grade',
      grades: { a: { grade: 'A' } },
      gridFilters: { grades: ['A'], colors: [], rarities: [], query: '' },
      _forcedGradeCardId: 'a',
    });
    render(state, el);
    moveState(state, el, 1, render);
    expect(state._forcedGradeCardId == null).toBe(true);
  });
});

describe('handleGradeKeydown', () => {
  function makeEvent(key, opts = {}) {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
    // jsdom KeyboardEvent.key may be set via opts; ensure case
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
    // Manually set defaultPrevented by dispatching? jsdom doesn't set after preventDefault on synthetic? Force
    Object.defineProperty(e, 'defaultPrevented', { value: true });
    const handled = handleGradeKeydown(e, state, vi.fn(), vi.fn());
    expect(handled).toBe(false);
  });
});
