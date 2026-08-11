import { cardImageUrl } from './scryfall.js';
import { GRADES, ANALYSIS_COLOR_VALUES, ANALYSIS_RARITY_VALUES } from './constants.js';

export function applyFilter(state) {
  state.filtered = state.filter === 'ungraded'
    ? state.cards.filter(c => !state.grades[c.id])
    : state.cards;
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
    el.gradeEmpty.textContent = state.filter === 'ungraded'
      ? 'Every card in this set has a grade. Switch to "All" to review them.'
      : 'No cards to show.';
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

export function renderGridView(state, el) {
  hideHoverCard(el);
  el.gridView.innerHTML = '';
  if (!state.filtered.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.style.gridColumn = '1 / -1';
    note.textContent = state.filter === 'ungraded'
      ? 'Every card in this set has a grade.'
      : 'No cards to show.';
    el.gridView.appendChild(note);
    return;
  }
  state.filtered.forEach((card, i) => {
    const item = document.createElement('button');
    item.className = 'grid-item';
    item._card = card;
    const img = document.createElement('img');
    img.src = cardImageUrl(card);
    img.alt = card.name;
    img.loading = 'lazy';
    item.appendChild(img);
    const grade = state.grades[card.id];
    if (grade) {
      const mini = document.createElement('div');
      mini.className = 'mini-seal';
      mini.textContent = grade.grade;
      item.appendChild(mini);
    }
    item.addEventListener('click', () => {
      state.index = i;
      setTab('grade', state, el);
    });
    el.gridView.appendChild(item);
  });
}

function cardGrade(state, card) {
  return state.grades[card.id] ? state.grades[card.id].grade : null;
}

function analysisMatches(state, card) {
  const f = state.analysisFilters;

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

export function buildAnalysisFilterBar(state, el) {
  const searchGroup = document.createElement('div');
  searchGroup.className = 'filter-group';

  const searchLabel = document.createElement('span');
  searchLabel.className = 'filter-label';
  searchLabel.textContent = 'Search';
  searchGroup.appendChild(searchLabel);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.id = 'analysis-search';
  searchInput.placeholder = 'Card name or type…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.addEventListener('input', () => {
    state.analysisFilters.query = searchInput.value.trim();
    renderAnalysisView(state, el);
  });
  searchGroup.appendChild(searchInput);
  el.analysisSearch = searchInput;
  el.analysisFilters.appendChild(searchGroup);

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
    el.analysisFilters.appendChild(groupEl);
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset-btn';
  reset.textContent = 'Reset filters';
  el.analysisFilters.appendChild(reset);
}

export function syncAnalysisChips(state, el) {
  [...el.analysisFilters.querySelectorAll('button.chip')].forEach(btn => {
    btn.classList.toggle('active', state.analysisFilters[btn.dataset.group].includes(btn.dataset.value));
  });
}

export function renderAnalysisView(state, el) {
  hideHoverCard(el);
  const filtered = state.cards.filter(card => analysisMatches(state, card));
  const lanes = [
    ...GRADES.map(g => ({ label: g, cards: filtered.filter(c => cardGrade(state, c) === g) })),
    { label: 'Ungraded', cards: filtered.filter(c => !cardGrade(state, c)) },
  ];

  el.analysisLanes.innerHTML = '';
  lanes.forEach(lane => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane';

    const head = document.createElement('div');
    head.className = 'lane-head';
    const grade = document.createElement('span');
    grade.className = 'lane-grade' + (lane.label === 'Ungraded' ? ' muted' : '');
    grade.textContent = lane.label;
    const count = document.createElement('span');
    count.className = 'lane-count';
    count.textContent = `${lane.cards.length} ${lane.cards.length === 1 ? 'card' : 'cards'}`;
    head.appendChild(grade);
    head.appendChild(count);
    laneEl.appendChild(head);

    const track = document.createElement('div');
    track.className = 'lane-track';
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
          state.filter = 'all';
          state.index = state.cards.indexOf(card);
          setTab('grade', state, el);
        });
        track.appendChild(btn);
      });
    }
    laneEl.appendChild(track);
    el.analysisLanes.appendChild(laneEl);
  });
}

export function render(state, el) {
  applyFilter(state);
  updateProgress(state, el);
  if (state.tab === 'grade') renderGradeView(state, el);
  else if (state.tab === 'grid') renderGridView(state, el);
  else renderAnalysisView(state, el);
}

export function setTab(tab, state, el) {
  state.tab = tab;
  [...el.tabGroup.children].forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  el.gradeView.style.display = tab === 'grade' ? 'block' : 'none';
  el.gridView.style.display = tab === 'grid' ? 'grid' : 'none';
  el.analysisView.style.display = tab === 'analysis' ? 'block' : 'none';
  render(state, el);
}

export function setFilter(filter, state, el) {
  state.filter = filter;
  state.index = 0;
  [...el.filterGroup.children].forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  render(state, el);
}

export function toggleAnalysisChip(state, el, chip) {
  const arr = state.analysisFilters[chip.dataset.group];
  const idx = arr.indexOf(chip.dataset.value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(chip.dataset.value);
  syncAnalysisChips(state, el);
  renderAnalysisView(state, el);
}

export function resetAnalysisFilters(state, el) {
  state.analysisFilters = { grades: [], colors: [], rarities: [], query: '' };
  if (el.analysisSearch) el.analysisSearch.value = '';
  syncAnalysisChips(state, el);
  renderAnalysisView(state, el);
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
    const item = e.target.closest('.lane-card, .grid-item');
    if (!item || !item._card) return;
    showHoverCard(state, el, item._card, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', e => {
    if (el.hoverCard.style.display === 'block') positionHoverCard(el, e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', e => {
    const item = e.target.closest('.lane-card, .grid-item');
    if (!item) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.lane-card, .grid-item')) return;
    hideHoverCard(el);
  });
}
