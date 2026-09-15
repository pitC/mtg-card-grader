import { gridFiltersActive, resetGradeButtons } from './render.js';
import { GRADES } from './constants.js';

export function moveState(state, el, delta, render) {
  const filtersActive = gridFiltersActive(state);
  if (state.tab === 'grade' && !filtersActive && state.cards.length) {
    let current = null;
    if (state._forcedGradeCardId) {
      current = state.cards.find(c => c.id === state._forcedGradeCardId);
    } else if (state.filtered.length) {
      current = state.filtered[state.index];
    }
    if (!current) {
      const idx = Math.max(0, Math.min(state.index, state.cards.length - 1));
      current = state.cards[idx];
    }
    const baseIdx = current ? state.cards.indexOf(current) : -1;
    if (baseIdx === -1) return;
    const targetIdx = baseIdx + delta;
    if (targetIdx < 0 || targetIdx >= state.cards.length) return;
    const target = state.cards[targetIdx];
    const isGraded = !!state.grades[target.id];
    if (isGraded) {
      state._forcedGradeCardId = target.id;
      resetGradeButtons(el);
      render(state, el);
    } else {
      if (state._forcedGradeCardId) delete state._forcedGradeCardId;
      const ungraded = state.cards.filter(c => !state.grades[c.id]);
      const newFilteredIdx = ungraded.indexOf(target);
      if (newFilteredIdx !== -1) {
        state.index = newFilteredIdx;
      } else {
        state.index = 0;
      }
      resetGradeButtons(el);
      render(state, el);
    }
    return;
  }

  if (state._forcedGradeCardId) delete state._forcedGradeCardId;
  const next = state.index + delta;
  if (next >= 0 && next < state.filtered.length) {
    state.index = next;
    resetGradeButtons(el);
    render(state, el);
  }
}

export function handleGradeKeydown(event, state, gradeFn, moveFn) {
  if (event.defaultPrevented) return false;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return false;
  if (state.tab !== 'grade') return false;
  const key = event.key.toUpperCase();
  if (GRADES.includes(key)) {
    event.preventDefault();
    gradeFn(key);
    return true;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveFn(-1);
    return true;
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    moveFn(1);
    return true;
  }
  return false;
}
