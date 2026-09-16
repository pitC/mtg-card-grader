const CACHE_PREFIXES = [
  'scryfallCardGraderSetCards:',
  'scryfallCardGraderSetMeta:',
  'scryfallCardGraderActual:',
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function clearCacheForSet(setCode) {
  const ls = getStorage();
  if (!setCode || !ls) return 0;
  const raw = String(setCode).trim().toLowerCase();
  if (!raw) return 0;
  const keys = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k) keys.push(k);
  }
  let removed = 0;
  for (const key of keys) {
    const lower = key.toLowerCase();
    for (const prefix of CACHE_PREFIXES) {
      if (lower === `${prefix.toLowerCase()}${raw}`) {
        ls.removeItem(key);
        removed++;
        break;
      }
    }
  }
  return removed;
}

export function clearAllCaches() {
  const ls = getStorage();
  if (!ls) return 0;
  const keys = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k) keys.push(k);
  }
  let removed = 0;
  for (const key of keys) {
    if (CACHE_PREFIXES.some(p => key.toLowerCase().startsWith(p.toLowerCase())) && ls.getItem(key) !== null) {
      ls.removeItem(key);
      removed++;
    }
  }
  return removed;
}

export function isQuotaExceededError(err) {
  return !!err && (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

function parseFetchedAt(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || !value.fetchedAt) return null;
    const t = new Date(value.fetchedAt).getTime();
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

function evictExpiredCaches() {
  if (typeof localStorage === 'undefined') return 0;
  const now = Date.now();
  let removed = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  for (const key of keys) {
    if (!CACHE_PREFIXES.some(p => key.startsWith(p))) continue;
    const raw = localStorage.getItem(key);
    const fetchedAt = parseFetchedAt(raw);
    if (fetchedAt === null) continue;
    if (now - fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      removed++;
    }
  }
  return removed;
}

function evictOldestCache() {
  if (typeof localStorage === 'undefined') return false;
  let oldestKey = null;
  let oldestTime = Infinity;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  for (const key of keys) {
    if (!CACHE_PREFIXES.some(p => key.startsWith(p))) continue;
    const raw = localStorage.getItem(key);
    const fetchedAt = parseFetchedAt(raw);
    if (fetchedAt === null) continue;
    if (fetchedAt < oldestTime) {
      oldestTime = fetchedAt;
      oldestKey = key;
    }
  }
  // If no timestamped cache found, fall back to any cache entry (e.g. malformed)
  if (!oldestKey) {
    for (const key of keys) {
      if (CACHE_PREFIXES.some(p => key.startsWith(p))) {
        oldestKey = key;
        break;
      }
    }
  }
  if (oldestKey) {
    localStorage.removeItem(oldestKey);
    return true;
  }
  return false;
}

export function safeSetItem(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;

    // Try reclaiming space from expired caches first
    if (evictExpiredCaches() > 0) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        if (!isQuotaExceededError(e)) throw e;
      }
    }

    // Evict oldest caches one by one until it fits or we run out
    while (evictOldestCache()) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        if (!isQuotaExceededError(e)) throw e;
      }
    }

    console.error('[Card Grader] localStorage quota exceeded, not caching', key);
    return false;
  }
}
