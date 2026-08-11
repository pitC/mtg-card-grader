import { getFirestoreApi } from './firebase.js';
import {
  loadStoredCollectionKey,
  saveStoredCollectionKey,
  markFirestoreSkipped,
  isFirestoreSkipped,
  saveLocalCache,
} from './storage.js';

export function normalizeCollectionKey(input) {
  const trimmed = input.trim();
  return trimmed && !trimmed.includes('/') ? trimmed : null;
}

export function showFirestoreSetup(statusEl) {
  return new Promise(resolve => {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div class="setup-box">
        <p>Sync grades across devices with the shared collection key from the webpage owner, or keep them in this browser only.</p>
        <input class="setup-input" id="collection-input" type="password" placeholder="Enter the shared collection key" autocomplete="off" spellcheck="false">
        <div class="setup-hint">
          Ask the webpage owner for the key. Each set is stored in its own Firestore document.
          Leave the key unshared except with people who should be able to read and update these grades.
        </div>
        <div class="setup-actions">
          <button class="primary" id="collection-save">Save &amp; sync</button>
          <button id="firestore-skip">Skip (local only)</button>
        </div>
      </div>
    `;

    const input = document.getElementById('collection-input');
    input.focus();

    document.getElementById('collection-save').addEventListener('click', () => {
      const collectionKey = normalizeCollectionKey(input.value);
      if (!collectionKey) {
        input.setCustomValidity('Enter a collection key without slashes.');
        input.reportValidity();
        input.focus();
        return;
      }
      input.setCustomValidity('');
      saveStoredCollectionKey(collectionKey);
      resolve(collectionKey);
    });

    document.getElementById('firestore-skip').addEventListener('click', () => {
      markFirestoreSkipped();
      resolve(null);
    });

    input.addEventListener('keydown', e => {
      input.setCustomValidity('');
      if (e.key === 'Enter') document.getElementById('collection-save').click();
    });
  });
}

export async function ensureSyncConfig(statusEl) {
  let collectionKey = loadStoredCollectionKey();
  if (!collectionKey && !isFirestoreSkipped()) {
    collectionKey = await showFirestoreSetup(statusEl);
  }
  return { collectionKey, cloudSync: !!collectionKey };
}

// Firestore sync when configured; otherwise per-set local storage only.
export async function fetchAllGrades({ collectionKey, setCode, localGrades, onStatus }) {
  if (!collectionKey) {
    onStatus('Local only');
    return { grades: localGrades, cloudSync: false };
  }

  onStatus('Syncing…');
  try {
    const { db, doc, getDoc } = await getFirestoreApi();
    const snapshot = await getDoc(doc(db, collectionKey, setCode));
    const grades = snapshot.exists() ? snapshot.data() : {};
    saveLocalCache(setCode, grades);
    onStatus('Synced');
    return { grades, cloudSync: true };
  } catch (e) {
    console.error('[Card Grader] Firestore sync error', e);
    onStatus('Local only (sync failed)');
    return { grades: localGrades, cloudSync: false };
  }
}

// Each Firestore document contains the complete grade map for one set.
export async function persistGrades({ collectionKey, setCode, grades, onStatus }) {
  saveLocalCache(setCode, grades);
  if (!collectionKey) {
    onStatus('Local only');
    return true;
  }

  onStatus('Saving…');
  try {
    const { db, doc, setDoc } = await getFirestoreApi();
    await setDoc(doc(db, collectionKey, setCode), grades);
    onStatus('Synced');
    return true;
  } catch (e) {
    console.error('[Card Grader] Firestore sync error', e);
    onStatus('Local only (sync failed)');
    return false;
  }
}
