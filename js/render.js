import { cardImageUrl } from './scryfall.js';
import { GRADES, ANALYSIS_COLOR_VALUES, ANALYSIS_RARITY_VALUES } from './constants.js';

export function applyFilter(state) {
  state.filtered = state.cards;
  if (state.index >= state.filtered.length) state.index = Math.max(0, state.filtered.length - 1);
}

export function findNextUngradedIndex(state) {
  return state.cards.findIndex(c => !state.grades[c.id]);
}

export function updateProgress(state, el) {
  const gradedCount = state.cards.filter(c => state.grades[c.id]).length;
  el.progress.innerHTML = `<strong>${gradedCount}</strong> / ${state.cards.length} graded`;
}

export function renderGradeView(state, el) {
  if (!state.filtered.length) {
    el.gradeContent.style.display = 'none';
    el.gradeEmpty.style.display = 'block';
    el.gradeEmpty.textContent = 'No cards to show.';
    return;
  }

  el.gradeContent.style.display = 'block';
  el.gradeEmpty.style.display = 'none';

  const card = state.filtered[state.index];
  if (!card) return;
  const grade = state.grades[card.id];

  el.cardImage.src = cardImageUrl(card);
  el.cardImage.alt = card.name;
  el.cardName.textContent = card.name;
  el.cardSub.textContent = `${card.rarity.toUpperCase()} · #${card.collector_number} · ${card.type_line || ''}`;

  if (grade) {
    el.seal.style.display = 'flex';
    el.seal.textContent = grade.grade;
  } else {
    el.seal.style.display = 'none';
  }

  [...el.gradeRow.children].forEach(btn => {
    btn.classList.toggle('active', grade && grade.grade === btn.dataset.grade);
  });

  el.prevBtn.disabled = state.index === 0;
  el.nextBtn.disabled = state.index === state.filtered.length - 1;
}

function cardGrade(state, card) {
  return state.grades[card.id] ? state.grades[card.id].grade : null;
}

function gridMatches(state, card) {
  const f = state.gridFilters;

  if (f.grades.length && !f.grades.includes(cardGrade(state, card))) return false;

  if (f.colors.length) {
    const colors = card.colors || [];
    const wantsColorless = f.colors.includes('C');
    const colorHits = f.colors.filter(c => c !== 'C').some(c => colors.includes(c));
    const isColorless = colors.length === 0;
    if (!(wantsColorless && isColorless) && !colorHits) return false;
  }

  if (f.rarities.length && !f.rarities.includes(card.rarity)) return false;

  if (f.query) {
    const q = f.query.toLowerCase();
    const nameHit = (card.name || '').toLowerCase().includes(q);
    const typeHit = (card.type_line || '').toLowerCase().includes(q);
    if (!nameHit && !typeHit) return false;
  }

  return true;
}

export function buildGridFilterBar(state, el) {
  const searchGroup = document.createElement('div');
  searchGroup.className = 'filter-group';

  const searchLabel = document.createElement('span');
  searchLabel.className = 'filter-label';
  searchLabel.textContent = 'Search';
  searchGroup.appendChild(searchLabel);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.id = 'grid-search';
  searchInput.placeholder = 'Card name or type…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.addEventListener('input', () => {
    state.gridFilters.query = searchInput.value.trim();
    renderGridView(state, el);
  });
  searchGroup.appendChild(searchInput);
  el.gridSearch = searchInput;
  el.gridFilters.appendChild(searchGroup);

  const groups = [
    {
      key: 'grades',
      label: 'Grade',
      values: GRADES.concat(['ungraded']).map(v => ({ value: v, cls: '' })),
    },
    { key: 'colors', label: 'Colour', values: ANALYSIS_COLOR_VALUES },
    {
      key: 'rarities',
      label: 'Rarity',
      values: ANALYSIS_RARITY_VALUES.map(v => ({ value: v, cls: '' })),
    },
  ];

  groups.forEach(g => {
    const groupEl = document.createElement('div');
    groupEl.className = 'filter-group';

    const label = document.createElement('span');
    label.className = 'filter-label';
    label.textContent = g.label;
    groupEl.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'chips';
    g.values.forEach(v => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (v.cls ? ' ' + v.cls : '');
      btn.dataset.group = g.key;
      btn.dataset.value = v.value;
      btn.textContent = v.value.toUpperCase();
      chips.appendChild(btn);
    });
    groupEl.appendChild(chips);
    el.gridFilters.appendChild(groupEl);
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset-btn';
  reset.textContent = 'Reset filters';
  el.gridFilters.appendChild(reset);
}

export function syncGridChips(state, el) {
  [...el.gridFilters.querySelectorAll('button.chip')].forEach(btn => {
    btn.classList.toggle('active', state.gridFilters[btn.dataset.group].includes(btn.dataset.value));
  });
}

export function renderGridView(state, el) {
  hideHoverCard(el);
  const filtered = state.cards.filter(card => gridMatches(state, card));
  const lanes = [
    ...GRADES.map(g => ({ label: g, cards: filtered.filter(c => cardGrade(state, c) === g) })),
    { label: 'Ungraded', cards: filtered.filter(c => !cardGrade(state, c)) },
  ];

  el.gridLanes.innerHTML = '';
  lanes.forEach(lane => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane';

    const collapsed = state.collapsedLanes && state.collapsedLanes.has(lane.label);

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'lane-head';
    head.setAttribute('aria-expanded', String(!collapsed));

    const caret = document.createElement('span');
    caret.className = 'lane-caret' + (collapsed ? ' collapsed' : '');
    caret.textContent = '▾';

    const grade = document.createElement('span');
    grade.className = 'lane-grade' + (lane.label === 'Ungraded' ? ' muted' : '');
    grade.textContent = lane.label;

    const count = document.createElement('span');
    count.className = 'lane-count';
    count.textContent = `${lane.cards.length} ${lane.cards.length === 1 ? 'card' : 'cards'}`;

    head.appendChild(caret);
    head.appendChild(grade);
    head.appendChild(count);
    head.addEventListener('click', () => {
      if (!state.collapsedLanes) state.collapsedLanes = new Set();
      if (state.collapsedLanes.has(lane.label)) state.collapsedLanes.delete(lane.label);
      else state.collapsedLanes.add(lane.label);
      renderGridView(state, el);
    });
    laneEl.appendChild(head);

    const track = document.createElement('div');
    track.className = 'lane-track' + (collapsed ? ' collapsed' : '');
    if (!lane.cards.length) {
      const empty = document.createElement('div');
      empty.className = 'lane-empty';
      empty.textContent = 'No cards match';
      track.appendChild(empty);
    } else {
      lane.cards.forEach(card => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lane-card';
        btn.title = card.name;
        btn._card = card;
        const img = document.createElement('img');
        img.src = cardImageUrl(card);
        img.alt = card.name;
        img.loading = 'lazy';
        btn.appendChild(img);
        btn.addEventListener('click', () => {
          state.index = state.cards.indexOf(card);
          setTab('grade', state, el);
        });
        track.appendChild(btn);
      });
    }
    laneEl.appendChild(track);
    el.gridLanes.appendChild(laneEl);
  });
}

export function render(state, el) {
  applyFilter(state);
  updateProgress(state, el);
  if (state.tab === 'grade') renderGradeView(state, el);
  else renderGridView(state, el);
}

export function setTab(tab, state, el) {
  state.tab = tab;
  [...el.tabGroup.children].forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  el.gradeView.style.display = tab === 'grade' ? 'block' : 'none';
  el.gridView.style.display = tab === 'grid' ? 'block' : 'none';
  render(state, el);
}

export function toggleGridChip(state, el, chip) {
  const arr = state.gridFilters[chip.dataset.group];
  const idx = arr.indexOf(chip.dataset.value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(chip.dataset.value);
  syncGridChips(state, el);
  renderGridView(state, el);
}

export function resetGridFilters(state, el) {
  state.gridFilters = { grades: [], colors: [], rarities: [], query: '' };
  if (el.gridSearch) el.gridSearch.value = '';
  syncGridChips(state, el);
  renderGridView(state, el);
}

const hoverSupported = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches;

function showHoverCard(state, el, card, x, y) {
  el.hoverCardImg.src = cardImageUrl(card, 'large');
  el.hoverCardImg.alt = card.name;
  el.hoverCard.style.display = 'block';
  positionHoverCard(el, x, y);
}

function hideHoverCard(el) {
  el.hoverCard.style.display = 'none';
}

function positionHoverCard(el, x, y) {
  const preview = el.hoverCard;
  const w = preview.offsetWidth;
  const h = preview.offsetHeight;
  let left = x + 18;
  if (left + w > window.innerWidth - 8) left = x - w - 18;
  let top = y - h / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  preview.style.left = left + 'px';
  preview.style.top = top + 'px';
}

export function setupHoverEvents(state, el) {
  if (!hoverSupported) return;

  document.addEventListener('mouseover', e => {
    const item = e.target.closest('.lane-card');
    if (!item || !item._card) return;
    showHoverCard(state, el, item._card, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', e => {
    if (el.hoverCard.style.display === 'block') positionHoverCard(el, e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', e => {
    const item = e.target.closest('.lane-card');
    if (!item) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.lane-card')) return;
    hideHoverCard(el);
  });
}
