// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  COLLECTION_KEY,
  COLLECTION_KEYS_KEY,
  FIRESTORE_SKIPPED_KEY,
  parseStoredGrades,
  localCacheKey,
  loadLocalCache,
  saveLocalCache,
  loadStoredCollectionKey,
  loadStoredCollectionKeys,
  saveStoredCollectionKey,
  removeStoredCollectionKey,
  markFirestoreSkipped,
  isFirestoreSkipped,
} from '../js/storage.js';

describe('parseStoredGrades', () => {
  it('parses a JSON object', () => {
    expect(parseStoredGrades('{"a":{"grade":"A"}}')).toEqual({ a: { grade: 'A' } });
  });

  it('returns {} for invalid JSON', () => {
    expect(parseStoredGrades('not json')).toEqual({});
  });

  it('returns {} for a JSON array', () => {
    expect(parseStoredGrades('[1,2,3]')).toEqual({});
  });

  it('returns {} for null JSON', () => {
    expect(parseStoredGrades('null')).toEqual({});
  });
});

describe('localCacheKey', () => {
  it('prefixes the set code', () => {
    expect(localCacheKey('dsk')).toBe('scryfallCardGraderGrades:dsk');
  });
});

describe('saveLocalCache / loadLocalCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips grades through localStorage', () => {
    const grades = { abc: { grade: 'A' } };
    saveLocalCache('dsk', grades);
    expect(localStorage.getItem(localCacheKey('dsk'))).toBe(JSON.stringify(grades));
    expect(loadLocalCache('dsk', [])).toEqual(grades);
  });

  it('returns {} when setCode is missing', () => {
    expect(loadLocalCache('', [])).toEqual({});
    expect(saveLocalCache('', {})).toBeUndefined();
  });

  it('migrates matching cards from the legacy cache on first open', () => {
    localStorage.setItem(
      'scryfallCardGraderGrades',
      JSON.stringify({
        keep: { grade: 'B' },
        other: { grade: 'C' },
      })
    );
    const cards = [{ id: 'keep' }];
    expect(loadLocalCache('dsk', cards)).toEqual({ keep: { grade: 'B' } });
    expect(loadLocalCache('dsk', cards)).toEqual({ keep: { grade: 'B' } });
    expect(localStorage.getItem('scryfallCardGraderGrades')).toBeTruthy();
  });
});

describe('collection key helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and loads the collection key, clearing the skip flag', () => {
    localStorage.setItem(FIRESTORE_SKIPPED_KEY, '1');
    saveStoredCollectionKey('key-123');
    expect(loadStoredCollectionKey()).toBe('key-123');
    expect(localStorage.getItem(FIRESTORE_SKIPPED_KEY)).toBeNull();
  });

  it('marks as skipped and clears the stored key', () => {
    localStorage.setItem(COLLECTION_KEY, 'key-123');
    markFirestoreSkipped();
    expect(isFirestoreSkipped()).toBe(true);
    expect(localStorage.getItem(COLLECTION_KEY)).toBeNull();
  });

  it('isFirestoreSkipped is false by default', () => {
    expect(isFirestoreSkipped()).toBe(false);
  });

  it('loads a list of previously saved collection keys, most recent first', () => {
    saveStoredCollectionKey('key-123');
    saveStoredCollectionKey('key-456');
    expect(loadStoredCollectionKeys()).toEqual(['key-456', 'key-123']);
  });

  it('deduplicates keys when saving again', () => {
    saveStoredCollectionKey('key-123');
    saveStoredCollectionKey('key-456');
    saveStoredCollectionKey('key-123');
    expect(loadStoredCollectionKeys()).toEqual(['key-123', 'key-456']);
  });

  it('grows from the legacy single key', () => {
    localStorage.setItem(COLLECTION_KEY, 'key-123');
    expect(loadStoredCollectionKeys()).toEqual(['key-123']);
    saveStoredCollectionKey('key-456');
    expect(loadStoredCollectionKeys()).toEqual(['key-456', 'key-123']);
  });

  it('removes a saved key without touching the active key', () => {
    saveStoredCollectionKey('key-123');
    saveStoredCollectionKey('key-456');
    removeStoredCollectionKey('key-123');
    expect(loadStoredCollectionKeys()).toEqual(['key-456']);
    expect(loadStoredCollectionKey()).toBe('key-456');
  });

  it('keeps the active key listed even after it is forgotten', () => {
    saveStoredCollectionKey('key-123');
    saveStoredCollectionKey('key-456');
    removeStoredCollectionKey('key-123');
    removeStoredCollectionKey('key-456');
    expect(localStorage.getItem(COLLECTION_KEYS_KEY)).toBe('[]');
    expect(loadStoredCollectionKey()).toBe('key-456');
    expect(loadStoredCollectionKeys()).toEqual(['key-456']);
  });

  it('clear list returns [], tolerating malformed JSON', () => {
    localStorage.setItem(COLLECTION_KEYS_KEY, 'not json');
    expect(loadStoredCollectionKeys()).toEqual([]);
  });
});
