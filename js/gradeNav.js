import { gridFiltersActive, gridFlatFiltered, resetGradeButtons } from './render.js';
import { GRADES } from './constants.js';

export function moveState(state, el, delta, render) {
  const filtersActive = gridFiltersActive(state);
  // Grid-entered grade: simple lane-order cycling through full filtered list
  if (state.tab === 'grade' && state._fromGrid && state.cards.length) {
    if (state._forcedGradeCardId) delete state._forcedGradeCardId;
    const next = state.index + delta;
    if (next >= 0 && next < state.filtered.length) {
      state.index = next;
      resetGradeButtons(el);
      render(state, el);
    }
    return;
  }
  if (state.tab === 'grade' && !filtersActive && !state._fromGrid && state.cards.length) {
    // Toggle entry: use deterministic grid lane order but only through ungraded
    const flat = gridFlatFiltered(state);
    let current = null;
    if (state._forcedGradeCardId) {
      current = state.cards.find(c => c.id === state._forcedGradeCardId);
    } else if (state.filtered.length) {
      current = state.filtered[state.index];
    }
    if (!current) {
      const idx = Math.max(0, Math.min(state.index, flat.length - 1));
      current = flat[idx] || state.cards[idx];
    }
    const baseIdx = current ? flat.indexOf(current) : -1;
    if (baseIdx === -1) return;
    const targetIdx = baseIdx + delta;
    if (targetIdx < 0 || targetIdx >= flat.length) return;
    const target = flat[targetIdx];
    const isGraded = !!state.grades[target.id];
    if (isGraded) {
      state._forcedGradeCardId = target.id;
      resetGradeButtons(el);
      render(state, el);
    } else {
      if (state._forcedGradeCardId) delete state._forcedGradeCardId;
      const ungradedFlat = flat.filter(c => !state.grades[c.id]);
      // When all cards are graded, flat fallback keeps cycling through graded cards
      if (!ungradedFlat.length && flat.length) {
        state._forcedGradeCardId = target.id;
        resetGradeButtons(el);
        render(state, el);
        return;
      }
      const newFilteredIdx = ungradedFlat.indexOf(target);
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
