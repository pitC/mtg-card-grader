const CACHE_PREFIXES = [
  'scryfallCardGraderSetCards:',
  'scryfallCardGraderSetMeta:',
  'scryfallCardGraderActual:',
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function clearCacheForSet(setCode) {
  if (!setCode || typeof localStorage === 'undefined') return 0;
  const raw = String(setCode).trim();
  if (!raw) return 0;
  const variants = new Set([raw, raw.toLowerCase(), raw.toUpperCase()]);
  const prefixes = CACHE_PREFIXES;
  let removed = 0;
  for (const variant of variants) {
    for (const prefix of prefixes) {
      const key = `${prefix}${variant}`;
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed++;
      }
    }
  }
  return removed;
}

export function clearAllCaches() {
  if (typeof localStorage === 'undefined') return 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  let removed = 0;
  for (const key of keys) {
    if (CACHE_PREFIXES.some(p => key.startsWith(p)) && localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
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
