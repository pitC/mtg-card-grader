import { ensureSyncConfig, fetchAllGrades, persistGrades, normalizeCollectionKey, fetchCollectionMetadata } from './firestore.js';
import { loadLocalCache, loadStoredCollectionKeys, removeStoredCollectionKey, saveStoredCollectionKey, markFirestoreSkipped } from './storage.js';
import { fetchSetByCode, fetchSetCards, getSetCodeFromUrl } from './scryfall.js';
import { initSetSelect } from './setSelect.js';
import { buildActualGrades, loadActualCache, saveActualCache, proxyUrl } from './actualGrades.js';
import {
  render,
  setTab,
  buildGridFilterBar,
  toggleGridChip,
  resetGridFilters,
  setupHoverEvents,
  findNextUngradedIndex,
  allCardsGraded,
} from './render.js';

const state = {
  setCode: null,
  cards: [],
  filtered: [],
  index: 0,
  tab: 'grade',
  grades: {},
  collectionKey: null,
  cloudSync: false,
  gridFilters: { grades: [], colors: [], rarities: [], query: '' },
  collapsedLanes: new Set(),
  gridScrollTop: 0,
  actualGrades: null,
  compareActive: false,
  compareLoading: false,
  compareFilter: null,
};

const el = {
  status: document.getElementById('status'),
  appHeader: document.getElementById('app-header'),
  setSelectView: document.getElementById('set-select-view'),
  setSearch: document.getElementById('set-search'),
  setSearchResults: document.getElementById('set-search-results'),
  setSearchInfo: document.getElementById('set-search-info'),
  setRecentSection: document.getElementById('set-recent-section'),
  recentSetsLoading: document.getElementById('recent-sets-loading'),
  recentSets: document.getElementById('recent-sets'),
  recentSetsEmpty: document.getElementById('recent-sets-empty'),
  gradeView: document.getElementById('grade-view'),
  gradeContent: document.getElementById('grade-content'),
  gradeEmpty: document.getElementById('grade-empty'),
  cardWrap: document.getElementById('card-wrap'),
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
  syncStatus: document.getElementById('sync-status'),
  syncKeyBtn: document.getElementById('sync-key-btn'),
  gridFilters: document.getElementById('grid-filters'),
  gridLanes: document.getElementById('grid-lanes'),
  gridSearch: document.getElementById('grid-search'),
  compareBtn: document.getElementById('compare-btn'),
  compareStatus: document.getElementById('compare-status'),
  compareSummary: document.getElementById('compare-summary'),
  hoverCard: document.getElementById('hover-card'),
  hoverCardImg: document.getElementById('hover-card-img'),
};

function setSyncStatus(text) {
  el.syncStatus.textContent = text;
}

function updateSyncKeyButton() {
  el.syncKeyBtn.textContent = state.collectionKey || 'No sync';
  el.syncKeyBtn.classList.toggle('active', !!state.collectionKey);
}

async function applySyncId(collectionKey) {
  if (collectionKey) saveStoredCollectionKey(collectionKey);
  else markFirestoreSkipped();
  state.collectionKey = collectionKey;
  state.cloudSync = !!collectionKey;

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
  updateSyncKeyButton();
  render(state, el);
}

function openChangeSyncId() {
  function renderKeyList(keys) {
    const list = document.createElement('div');
    list.className = 'sync-key-list';
    if (!keys.length) {
      const empty = document.createElement('div');
      empty.className = 'sync-key-empty';
      empty.textContent = 'No saved sync ids.';
      list.appendChild(empty);
      return list;
    }
    for (const key of keys) {
      const row = document.createElement('div');
      row.className = 'sync-key-row';
      if (key === state.collectionKey) row.classList.add('active');

      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'sync-key-choose';

      const idText = document.createElement('span');
      idText.className = 'sync-key-id';
      idText.textContent = key;
      choose.appendChild(idText);

      choose.addEventListener('click', () => {
        close();
        applySyncId(key);
      });

      fetchCollectionMetadata(key).then(meta => {
        const description = meta && meta.description;
        const descText = document.createElement('span');
        descText.className = `sync-key-desc${description ? '' : ' empty'}`;
        descText.textContent = description || 'No description';
        choose.appendChild(descText);
      });

      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'sync-key-remove';
      forget.title = 'Forget this sync id';
      forget.textContent = 'Forget';
      forget.addEventListener('click', () => {
        removeStoredCollectionKey(key);
        list.replaceChildren(renderKeyList(loadStoredCollectionKeys()));
      });

      row.appendChild(choose);
      row.appendChild(forget);
      list.appendChild(row);
    }
    return list;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'setup-input';
  input.id = 'sync-key-input';
  input.placeholder = 'New sync id, then “Use this id”…';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const actions = document.createElement('div');
  actions.className = 'setup-actions';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.id = 'sync-key-save';
  save.textContent = 'Use this id';
  save.addEventListener('click', async () => {
    const key = normalizeCollectionKey(input.value);
    if (!key) {
      input.setCustomValidity('Enter a sync id without slashes.');
      input.reportValidity();
      input.focus();
      return;
    }
    input.setCustomValidity('');
    close();
    await applySyncId(key);
  });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'sync-key-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);

  actions.appendChild(save);
  actions.appendChild(cancel);

  const title = document.createElement('p');
  title.className = 'modal-title';
  title.textContent = 'Sync id';

  const note = document.createElement('p');
  note.className = 'modal-note';
  note.textContent = 'Grades for this set are stored under a shared collection id. Pick a saved one to switch, or enter a new id.';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.appendChild(title);
  modal.appendChild(note);
  modal.appendChild(renderKeyList(loadStoredCollectionKeys()));
  modal.appendChild(input);
  modal.appendChild(actions);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.appendChild(modal);

  document.body.appendChild(overlay);

  input.focus();

  const onKey = e => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  input.addEventListener('keydown', e => {
    input.setCustomValidity('');
    if (e.key === 'Enter') save.click();
  });

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
}

async function gradeCurrentCard(grade) {
  if (!state.filtered.length) return;
  const card = state.filtered[state.index];
  state.grades[card.id] = {
    cardName: card.name,
    grade,
    gradedAt: new Date().toISOString(),
  };
  if (allCardsGraded(state) && state.tab === 'grade') {
    setTab('grid', state, el);
  } else {
    render(state, el);
  }
  const ok = await persistGrades({
    collectionKey: state.collectionKey,
    setCode: state.setCode,
    grades: state.grades,
    onStatus: setSyncStatus,
  });
  if (!ok) {
    state.cloudSync = false;
    state.collectionKey = null;
    updateSyncKeyButton();
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

function setCompareStatus(text, isError) {
  el.compareStatus.textContent = text || '';
  el.compareStatus.classList.toggle('error', !!isError);
}

async function toggleComparison() {
  if (state.compareLoading) return;

  if (state.compareActive) {
    state.compareActive = false;
    state.compareFilter = null;
    el.compareBtn.classList.remove('active');
    render(state, el);
    return;
  }

  state.compareLoading = true;
  el.compareBtn.disabled = true;
  setCompareStatus('Fetching 17Lands data…');
  try {
    let result = state.actualGrades || loadActualCache(state.setCode);
    if (!result) {
      result = await buildActualGrades({ setCode: state.setCode });
      saveActualCache(state.setCode, result);
    }
    if (!Object.keys(result.byName).length) throw new Error('No 17Lands data found for this set');
    state.actualGrades = result;
    state.compareActive = true;
    el.compareBtn.classList.add('active');
    setCompareStatus('');
  } catch (err) {
    console.error('[Card Grader] 17Lands comparison error', err);
    setCompareStatus(`Error: ${err.message || err}. Proxy: ${proxyUrl('https://test.com')}`, true);
  } finally {
    state.compareLoading = false;
    el.compareBtn.disabled = false;
    render(state, el);
  }
}

el.tabGroup.addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (btn) setTab(btn.dataset.tab, state, el);
});

el.gradeRow.addEventListener('click', e => {
  const btn = e.target.closest('button[data-grade]');
  if (btn) gradeCurrentCard(btn.dataset.grade);
});

el.prevBtn.addEventListener('click', () => move(-1));
el.nextBtn.addEventListener('click', () => move(1));
el.clearBtn.addEventListener('click', clearCurrentCard);
el.compareBtn.addEventListener('click', toggleComparison);
el.syncKeyBtn.addEventListener('click', openChangeSyncId);
el.cardWrap.addEventListener('click', () => setTab('grid', state, el));

el.compareSummary.addEventListener('click', e => {
  const chip = e.target.closest('button[data-cmp]');
  if (!chip) return;
  state.compareFilter = chip.dataset.cmp === 'all' ? null : chip.dataset.cmp;
  render(state, el);
});

el.gridFilters.addEventListener('click', e => {
  const chip = e.target.closest('button.chip');
  if (chip) {
    toggleGridChip(state, el, chip);
    return;
  }
  if (e.target.closest('.reset-btn')) {
    resetGridFilters(state, el);
  }
});

setupHoverEvents(state, el);

async function initSetSelectScreen() {
  el.appHeader.style.display = 'none';
  el.status.style.display = 'none';
  el.setSelectView.style.display = 'block';
  try {
    await initSetSelect(el);
  } catch (err) {
    el.setSelectView.style.display = 'none';
    el.status.style.display = 'block';
    el.status.innerHTML = `
      <div>Could not load the set list from Scryfall.</div>
      <div style="font-size:11px; margin-top:6px; color: var(--muted-dim);">${err.message}</div>
      <button class="retry" id="retry-btn">Retry</button>
    `;
    document.getElementById('retry-btn').addEventListener('click', initSetSelectScreen);
  }
}

async function init() {
  const requestedSet = getSetCodeFromUrl();
  if (!requestedSet) {
    await initSetSelectScreen();
    return;
  }

  try {
    const { collectionKey, cloudSync } = await ensureSyncConfig(el.status);
    state.collectionKey = collectionKey;
    state.cloudSync = cloudSync;
    if (!cloudSync) setSyncStatus('Local only');
    updateSyncKeyButton();

    el.status.innerHTML = `<div class="pulse"></div>Fetching set “${requestedSet}” from Scryfall…`;

    const set = await fetchSetByCode(requestedSet);
    if (!set) throw new Error('No suitable set found');
    state.setCode = set.code;

    document.title = `Card Grader — ${set.name}`;
    el.setName.textContent = set.name;
    el.setMeta.textContent = `${set.released_at}`;
    if (set.icon_svg_uri) el.setIcon.style.maskImage = el.setIcon.style.webkitMaskImage = `url("${set.icon_svg_uri}")`;

    const cards = await fetchSetCards(set.code);
    if (!cards.length) throw new Error('No cards with images found in this set');
    state.cards = cards;

    buildGridFilterBar(state, el);

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
      updateSyncKeyButton();
    }

    const firstUngraded = findNextUngradedIndex(state);
    if (firstUngraded >= 0) state.index = firstUngraded;

    // Auto-switch to grid if all cards in the set are graded
    if (allCardsGraded(state) && state.tab === 'grade') {
      el.status.style.display = 'none';
      setTab('grid', state, el);
    } else {
      el.status.style.display = 'none';
      el.gradeView.style.display = 'block';
      render(state, el);
    }
  } catch (err) {
    el.status.innerHTML = `
      <div>Could not load a set from Scryfall.</div>
      <div style="font-size:11px; margin-top:6px; color: var(--muted-dim);">${err.message}</div>
      <button class="retry" id="retry-btn">Retry</button>
    `;
    document.getElementById('retry-btn').addEventListener('click', () => {
      el.status.innerHTML = `<div class="pulse"></div>Fetching set “${getSetCodeFromUrl()}” from Scryfall…`;
      init();
    });
  }
}

init();
