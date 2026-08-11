import { ensureSyncConfig, fetchAllGrades, persistGrades } from './firestore.js';
import { loadLocalCache } from './storage.js';
import { fetchSetByCode, findLatestSet, fetchSetCards, getSetCodeFromUrl } from './scryfall.js';
import { GRADES } from './constants.js';
import {
  render,
  setTab,
  setFilter,
  buildAnalysisFilterBar,
  toggleAnalysisChip,
  resetAnalysisFilters,
  setupHoverEvents,
  findNextUngradedIndex,
} from './render.js';

const state = {
  setCode: null,
  cards: [],
  filtered: [],
  index: 0,
  filter: 'all',
  tab: 'grade',
  grades: {},
  collectionKey: null,
  cloudSync: false,
  analysisFilters: { grades: [], colors: [], rarities: [], query: '' },
};

const el = {
  status: document.getElementById('status'),
  gradeView: document.getElementById('grade-view'),
  gradeContent: document.getElementById('grade-content'),
  gradeEmpty: document.getElementById('grade-empty'),
  gridView: document.getElementById('grid-view'),
  setName: document.getElementById('set-name'),
  setMeta: document.getElementById('set-meta'),
  setIcon: document.getElementById('set-icon'),
  progress: document.getElementById('progress'),
  cardImage: document.getElementById('card-image'),
  cardName: document.getElementById('card-name'),
  cardSub: document.getElementById('card-sub'),
  seal: document.getElementById('seal'),
  gradeRow: document.getElementById('grade-row'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  clearBtn: document.getElementById('clear-btn'),
  tabGroup: document.getElementById('tab-group'),
  filterGroup: document.getElementById('filter-group'),
  syncStatus: document.getElementById('sync-status'),
  analysisView: document.getElementById('analysis-view'),
  analysisFilters: document.getElementById('analysis-filters'),
  analysisLanes: document.getElementById('analysis-lanes'),
  analysisSearch: document.getElementById('analysis-search'),
  hoverCard: document.getElementById('hover-card'),
  hoverCardImg: document.getElementById('hover-card-img'),
};

function setSyncStatus(text) {
  el.syncStatus.textContent = text;
}

async function gradeCurrentCard(grade) {
  if (!state.filtered.length) return;
  const card = state.filtered[state.index];
  state.grades[card.id] = {
    cardName: card.name,
    grade,
    gradedAt: new Date().toISOString(),
  };
  render(state, el);
  const ok = await persistGrades({
    collectionKey: state.collectionKey,
    setCode: state.setCode,
    grades: state.grades,
    onStatus: setSyncStatus,
  });
  if (!ok) {
    state.cloudSync = false;
    state.collectionKey = null;
  }
}

async function clearCurrentCard() {
  if (!state.filtered.length) return;
  const card = state.filtered[state.index];
  delete state.grades[card.id];
  render(state, el);
  const ok = await persistGrades({
    collectionKey: state.collectionKey,
    setCode: state.setCode,
    grades: state.grades,
    onStatus: setSyncStatus,
  });
  if (!ok) {
    state.cloudSync = false;
    state.collectionKey = null;
  }
}

function move(delta) {
  const next = state.index + delta;
  if (next >= 0 && next < state.filtered.length) {
    state.index = next;
    render(state, el);
  }
}

el.tabGroup.addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (btn) setTab(btn.dataset.tab, state, el);
});

el.filterGroup.addEventListener('click', e => {
  const btn = e.target.closest('button[data-filter]');
  if (btn) setFilter(btn.dataset.filter, state, el);
});

el.gradeRow.addEventListener('click', e => {
  const btn = e.target.closest('button[data-grade]');
  if (btn) gradeCurrentCard(btn.dataset.grade);
});

el.prevBtn.addEventListener('click', () => move(-1));
el.nextBtn.addEventListener('click', () => move(1));
el.clearBtn.addEventListener('click', clearCurrentCard);

el.analysisFilters.addEventListener('click', e => {
  const chip = e.target.closest('button.chip');
  if (chip) {
    toggleAnalysisChip(state, el, chip);
    return;
  }
  if (e.target.closest('.reset-btn')) {
    resetAnalysisFilters(state, el);
  }
});

setupHoverEvents(state, el);

document.addEventListener('keydown', e => {
  if (state.tab !== 'grade') return;
  const key = e.key.toUpperCase();
  if (GRADES.includes(key)) gradeCurrentCard(key);
  else if (e.key === 'ArrowLeft') move(-1);
  else if (e.key === 'ArrowRight') move(1);
});

async function init() {
  try {
    const { collectionKey, cloudSync } = await ensureSyncConfig(el.status);
    state.collectionKey = collectionKey;
    state.cloudSync = cloudSync;
    if (!cloudSync) setSyncStatus('Local only');

    const requestedSet = getSetCodeFromUrl();
    el.status.innerHTML = requestedSet
      ? `<div class="pulse"></div>Fetching set “${requestedSet}” from Scryfall…`
      : '<div class="pulse"></div>Fetching the latest set from Scryfall…';

    const set = requestedSet
      ? await fetchSetByCode(requestedSet)
      : await findLatestSet();
    if (!set) throw new Error('No suitable set found');
    state.setCode = set.code;

    document.title = `Card Grader — ${set.name}`;
    el.setName.textContent = set.name;
    el.setMeta.textContent = `${set.released_at}`;
    if (set.icon_svg_uri) el.setIcon.style.maskImage = el.setIcon.style.webkitMaskImage = `url("${set.icon_svg_uri}")`;

    const cards = await fetchSetCards(set.code);
    if (!cards.length) throw new Error('No cards with images found in this set');
    state.cards = cards;

    buildAnalysisFilterBar(state, el);

    const localGrades = loadLocalCache(state.setCode, state.cards);
    const result = await fetchAllGrades({
      collectionKey: state.collectionKey,
      setCode: state.setCode,
      localGrades,
      onStatus: setSyncStatus,
    });
    state.grades = result.grades;
    if (!result.cloudSync) {
      state.cloudSync = false;
      state.collectionKey = null;
    }

    const firstUngraded = findNextUngradedIndex(state);
    if (firstUngraded >= 0) state.index = firstUngraded;

    el.status.style.display = 'none';
    el.gradeView.style.display = 'block';
    render(state, el);
  } catch (err) {
    el.status.innerHTML = `
      <div>Could not load a set from Scryfall.</div>
      <div style="font-size:11px; margin-top:6px; color: var(--muted-dim);">${err.message}</div>
      <button class="retry" id="retry-btn">Retry</button>
    `;
    document.getElementById('retry-btn').addEventListener('click', () => {
      const requestedSet = getSetCodeFromUrl();
      el.status.innerHTML = requestedSet
        ? `<div class="pulse"></div>Fetching set “${requestedSet}” from Scryfall…`
        : '<div class="pulse"></div>Fetching the latest set from Scryfall…';
      init();
    });
  }
}

init();
