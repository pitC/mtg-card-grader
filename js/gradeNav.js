import { resetGradeButtons } from './render.js';
import { GRADES } from './constants.js';

export function moveState(state, el, delta, render) {
  if (state.tab === 'grade' && Array.isArray(state.gradingQueue)) {
    const len = state.gradingQueue.length;
    if (len <= 1) return;
    const cur = typeof state.gradingIndex === 'number' ? state.gradingIndex : state.index;
    let next = cur + delta;
    next = ((next % len) + len) % len;
    state.gradingIndex = next;
    state.index = next;
    state.filtered = state.gradingQueue;
    resetGradeButtons(el);
    render(state, el);
    return;
  }

  const next = state.index + delta;
  if (next >= 0 && next < state.filtered.length) {
    state.index = next;
    if (typeof state.gradingIndex === 'number') state.gradingIndex = next;
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
