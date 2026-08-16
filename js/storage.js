export const COLLECTION_KEY = 'scryfallCardGraderFirestoreCollection';
export const COLLECTION_KEYS_KEY = 'scryfallCardGraderFirestoreCollections';
export const FIRESTORE_SKIPPED_KEY = 'scryfallCardGraderFirestoreSkipped';

const LEGACY_LOCAL_KEY = 'scryfallCardGraderGrades';
const LOCAL_KEY_PREFIX = 'scryfallCardGraderGrades:';

export function parseStoredGrades(value) {
  try {
    const grades = JSON.parse(value);
    return grades && typeof grades === 'object' && !Array.isArray(grades) ? grades : {};
  } catch {
    return {};
  }
}

export function localCacheKey(setCode) {
  return `${LOCAL_KEY_PREFIX}${setCode}`;
}

export function loadLocalCache(setCode, cards) {
  if (!setCode) return {};

  const stored = localStorage.getItem(localCacheKey(setCode));
  if (stored !== null) return parseStoredGrades(stored);

  // Migrate cards for this set from the original cross-set cache. Keep the
  // legacy cache so other sets can migrate when they are opened later.
  const legacyGrades = parseStoredGrades(localStorage.getItem(LEGACY_LOCAL_KEY));
  const cardIds = new Set(cards.map(card => card.id));
  const migrated = Object.fromEntries(
    Object.entries(legacyGrades).filter(([cardId]) => cardIds.has(cardId))
  );
  localStorage.setItem(localCacheKey(setCode), JSON.stringify(migrated));
  return migrated;
}

export function saveLocalCache(setCode, grades) {
  if (!setCode) return;
  localStorage.setItem(localCacheKey(setCode), JSON.stringify(grades));
}

export function loadStoredCollectionKey() {
  return localStorage.getItem(COLLECTION_KEY);
}

export function loadStoredCollectionKeys() {
  let keys = [];
  try {
    const stored = JSON.parse(localStorage.getItem(COLLECTION_KEYS_KEY));
    if (Array.isArray(stored)) keys = stored.filter(k => typeof k === 'string' && k.length > 0);
  } catch {
    // malformed list; fall through to the legacy single key
  }
  const active = localStorage.getItem(COLLECTION_KEY);
  if (active && !keys.includes(active)) keys.push(active);
  return keys;
}

export function saveStoredCollectionKey(collectionKey) {
  const keys = loadStoredCollectionKeys().filter(k => k !== collectionKey);
  keys.unshift(collectionKey);
  localStorage.setItem(COLLECTION_KEYS_KEY, JSON.stringify(keys));
  localStorage.setItem(COLLECTION_KEY, collectionKey);
  localStorage.removeItem(FIRESTORE_SKIPPED_KEY);
}

export function removeStoredCollectionKey(collectionKey) {
  const keys = loadStoredCollectionKeys().filter(k => k !== collectionKey);
  localStorage.setItem(COLLECTION_KEYS_KEY, JSON.stringify(keys));
}

export function markFirestoreSkipped() {
  localStorage.setItem(FIRESTORE_SKIPPED_KEY, '1');
  localStorage.removeItem(COLLECTION_KEY);
}

export function isFirestoreSkipped() {
  return localStorage.getItem(FIRESTORE_SKIPPED_KEY) === '1';
}
