import { cardImageUrl } from './scryfall.js';
import { GRADES, ANALYSIS_COLOR_VALUES, ANALYSIS_RARITY_VALUES } from './constants.js';
import { compareOwnVsActual, compareOwnVsActualDelta, cardLookupName } from './actualGrades.js';

export function gridFiltersActive(state) {
  const f = state.gridFilters;
  if (f && (f.grades.length || f.colors.length || f.rarities.length || f.query)) return true;
  return !!(state.compareActive && state.compareFilter);
}

export function applyFilter(state) {
  state.filtered = gridFiltersActive(state)
    ? state.cards.filter(card => gridMatches(state, card))
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

// Actual "all decks" grade entry for a card, or null when not available.
function actualGradeForCard(state, card) {
  if (!state.actualGrades || state.compareActive !== true) return null;
  const entry = state.actualGrades.byName[cardLookupName(card)];
  return entry ? entry.all || null : null;
}

// 'match' | 'over' | 'under' | null (missing own grade or 17Lands data).
function comparisonStatus(state, card) {
  const ownGrade = cardGrade(state, card);
  if (!ownGrade) return null;
  const actual = actualGradeForCard(state, card);
  return actual ? compareOwnVsActual(ownGrade, actual.grade) : null;
}

// Signed grade delta (own - actual bucket) or null when not comparable.
function comparisonDelta(state, card) {
  const ownGrade = cardGrade(state, card);
  if (!ownGrade) return null;
  const actual = actualGradeForCard(state, card);
  return actual ? compareOwnVsActualDelta(ownGrade, actual.grade) : null;
}

// Whether a card satisfies the active comparison filter. 'strong-over' /
// 'strong-under' are the >=2-grade-difference subsets of over/under.
function comparisonMatchesFilter(state, card) {
  const filter = state.compareFilter;
  const delta = comparisonDelta(state, card);
  if (delta == null) return false;
  if (filter === 'match') return delta === 0;
  if (filter === 'over') return delta < 0;
  if (filter === 'under') return delta > 0;
  if (filter === 'strong-over') return delta <= -2;
  if (filter === 'strong-under') return delta >= 2;
  return false;
}

export function renderCompareSummary(state, el) {
  if (!state.actualGrades || !state.compareActive) {
    el.compareSummary.style.display = 'none';
    return;
  }

  let match = 0;
  let over = 0;
  let under = 0;
  let noData = 0;
  for (const card of state.cards) {
    if (!cardGrade(state, card)) continue;
    const status = comparisonStatus(state, card);
    if (!status) noData += 1;
    else if (status === 'match') match += 1;
    else if (status === 'over') over += 1;
    else under += 1;
  }

  const compared = match + over + under;
  const activeFilter = state.compareFilter || 'all';
  const chips = [
    ['all', 'All'],
    ['match', 'Match'],
    ['over', 'Overrated'],
    ['under', 'Underrated'],
    ['strong-over', 'Strong over'],
    ['strong-under', 'Strong under'],
  ].map(([value, label]) =>
    `<button type="button" class="cmp-filter-chip${value === activeFilter ? ' active' : ''}" data-cmp="${value}">${label}</button>`
  ).join('');

  el.compareSummary.style.display = 'flex';
  el.compareSummary.innerHTML = `
    <span class="compare-total">${compared} graded cards compared</span>
    <span class="compare-chip"><i class="dot cmp-match-dot"></i>${match} match</span>
    <span class="compare-chip"><i class="dot cmp-over-dot"></i>${over} overrated · yours higher</span>
    <span class="compare-chip"><i class="dot cmp-under-dot"></i>${under} underrated · yours lower</span>
    ${noData ? `<span class="compare-chip">${noData} no 17Lands grade</span>` : ''}
    <span class="compare-filter-group">${chips}</span>
    <span class="compare-note">Actual grades come from 17Lands, relative within each colour pair (PremierDraft, all time). Over/under compare your A–E grade against the bucketed actual grade; Strong filters keep cards 2+ grade positions apart. Lanes stay grouped by your grade.</span>
  `;
}

function gridMatches(state, card) {
  const f = state.gridFilters;

  if (state.compareActive && state.compareFilter) {
    if (!comparisonMatchesFilter(state, card)) return false;
  }

  if (f.grades.length) {
    const grade = cardGrade(state, card);
    const matchesGrade = grade ? f.grades.includes(grade) : f.grades.includes('ungraded');
    if (!matchesGrade) return false;
  }

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
    const oracleHit = (card.oracle_text || '').toLowerCase().includes(q);
    if (!nameHit && !typeHit && !oracleHit) return false;
  }

  return true;
}

export function buildGridFilterBar(state, el) {
  const searchRow = document.createElement('div');
  searchRow.className = 'grid-search-row';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.id = 'grid-search';
  searchInput.placeholder = 'Card name, type, or text…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.addEventListener('input', () => {
    state.gridFilters.query = searchInput.value.trim();
    renderGridView(state, el);
  });
  searchRow.appendChild(searchInput);
  el.gridSearch = searchInput;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'grid-filter-toggle';
  const caret = document.createElement('span');
  caret.className = 'grid-filter-caret';
  caret.textContent = '▾';
  const toggleLabel = document.createElement('span');
  toggleLabel.textContent = 'Filters';
  toggle.appendChild(caret);
  toggle.appendChild(toggleLabel);
  el.gridFilterToggle = toggle;
  toggle.addEventListener('click', () => {
    state.gridFiltersCollapsed = !(state.gridFiltersCollapsed ?? true);
    applyGridFilterCollapse(state, el);
  });

  const body = document.createElement('div');
  body.className = 'grid-filters-body';

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
      btn.className = `chip${v.cls ? ` ${v.cls}` : ''}`;
      btn.dataset.group = g.key;
      btn.dataset.value = v.value;
      btn.textContent = v.value.toUpperCase();
      chips.appendChild(btn);
    });
    groupEl.appendChild(chips);
    body.appendChild(groupEl);
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset-btn';
  reset.textContent = 'Reset filters';
  body.appendChild(reset);

  const summary = document.createElement('div');
  summary.className = 'filter-summary';
  el.gridFilterSummary = summary;

  let toolbar = el.gridView.querySelector('.grid-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';
    el.gridView.appendChild(toolbar);
  }
  el.gridView.insertBefore(searchRow, toolbar);
  toolbar.insertBefore(toggle, toolbar.querySelector('.compare-status'));
  toolbar.appendChild(summary);

  el.gridFilters.appendChild(body);

  if (state.gridFiltersCollapsed === undefined && mobileQuery) {
    state.gridFiltersCollapsed = !mobileQuery.matches;
  }
  if (mobileQuery) {
    mobileQuery.addEventListener('change', e => {
      if (!e.matches) state.gridFiltersCollapsed = false;
      applyGridFilterCollapse(state, el);
    });
  }
  applyGridFilterCollapse(state, el);
}

function applyGridFilterCollapse(state, el) {
  const collapsed = state.gridFiltersCollapsed !== false;
  el.gridFilters.classList.toggle('collapsed', collapsed);
  if (el.gridFilterToggle) el.gridFilterToggle.classList.toggle('collapsed', collapsed);
}

export function syncGridChips(state, el) {
  [...el.gridFilters.querySelectorAll('button.chip')].forEach(btn => {
    btn.classList.toggle('active', state.gridFilters[btn.dataset.group].includes(btn.dataset.value));
  });
}

export function renderGridView(state, el) {
  hideHoverCard(el);
  renderCompareSummary(state, el);
  const filtered = state.cards.filter(card => gridMatches(state, card));
  if (el.gridFilterSummary) {
    const total = state.cards.length;
    el.gridFilterSummary.innerHTML = gridFiltersActive(state)
      ? `<strong>${filtered.length}</strong> / ${total} cards match`
      : `<strong>${total}</strong> cards`;
  }
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
    caret.className = `lane-caret${collapsed ? ' collapsed' : ''}`;
    caret.textContent = '▾';

    const grade = document.createElement('span');
    grade.className = `lane-grade${lane.label === 'Ungraded' ? ' muted' : ''}`;
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
    track.className = `lane-track${collapsed ? ' collapsed' : ''}`;
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

        const actual = actualGradeForCard(state, card);
        if (actual) {
          const ownGrade = cardGrade(state, card);
          const status = ownGrade ? compareOwnVsActual(ownGrade, actual.grade) : null;
          if (status === 'over' || status === 'under') btn.classList.add(`cmp-${status}`);
          const badge = document.createElement('span');
          badge.className = `cmp-badge${status ? ` cmp-${status}` : ''}`;
          badge.textContent = `${status === 'over' ? '↑ ' : status === 'under' ? '↓ ' : ''}${actual.grade}`;
          btn.appendChild(badge);
        }

        btn.addEventListener('click', () => {
          setTab('grade', state, el, { index: filtered.indexOf(card) });
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

export function setTab(tab, state, el, opts = {}) {
  if (tab === 'grade' && state.tab !== 'grade' && gridFiltersActive(state) && opts.index === undefined) {
    state.index = 0;
  }
  if (opts.index !== undefined) state.index = opts.index;
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

const mobileQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(max-width: 640px)')
  : null;

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
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
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
