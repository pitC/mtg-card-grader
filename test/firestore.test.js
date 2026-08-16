// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from '../js/firestore.js';
import { getFirestoreApi } from '../js/firebase.js';
import { COLLECTION_KEY, FIRESTORE_SKIPPED_KEY } from '../js/storage.js';

vi.mock('../js/firebase.js', () => ({
  getFirestoreApi: vi.fn(),
}));

describe('normalizeCollectionKey', () => {
  it('trims surrounding whitespace', () => {
    expect(firestore.normalizeCollectionKey('  abc123  ')).toBe('abc123');
  });

  it('rejects keys containing slashes', () => {
    expect(firestore.normalizeCollectionKey('abc/def')).toBeNull();
  });

  it('rejects blank input', () => {
    expect(firestore.normalizeCollectionKey('   ')).toBeNull();
  });
});

describe('ensureSyncConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getFirestoreApi).mockReset();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the stored collection key', async () => {
    localStorage.setItem(COLLECTION_KEY, 'key-123');
    const result = await firestore.ensureSyncConfig(document.createElement('div'));
    expect(result).toEqual({ collectionKey: 'key-123', cloudSync: true });
  });

  it('stays local when the user skipped Firestore', async () => {
    localStorage.setItem(FIRESTORE_SKIPPED_KEY, '1');
    const result = await firestore.ensureSyncConfig(document.createElement('div'));
    expect(result).toEqual({ collectionKey: null, cloudSync: false });
  });

  it('prompts for setup and resolves the entered key', async () => {
    const statusEl = document.createElement('div');
    document.body.appendChild(statusEl);
    const promise = firestore.ensureSyncConfig(statusEl);
    const input = statusEl.querySelector('#collection-input');
    input.value = 'shared-key';
    statusEl.querySelector('#collection-save').click();
    expect(await promise).toEqual({ collectionKey: 'shared-key', cloudSync: true });
    expect(localStorage.getItem(COLLECTION_KEY)).toBe('shared-key');
  });

  it('prompts for setup and stays local when skipped', async () => {
    const statusEl = document.createElement('div');
    document.body.appendChild(statusEl);
    const promise = firestore.ensureSyncConfig(statusEl);
    statusEl.querySelector('#firestore-skip').click();
    expect(await promise).toEqual({ collectionKey: null, cloudSync: false });
    expect(localStorage.getItem(FIRESTORE_SKIPPED_KEY)).toBe('1');
  });
});

describe('fetchAllGrades', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getFirestoreApi).mockReset();
  });

  it('stays local when there is no collection key', async () => {
    const onStatus = vi.fn();
    const result = await firestore.fetchAllGrades({
      collectionKey: null,
      setCode: 'dsk',
      localGrades: { a: { grade: 'A' } },
      onStatus,
    });
    expect(result).toEqual({ grades: { a: { grade: 'A' } }, cloudSync: false });
    expect(onStatus).toHaveBeenCalledWith('Local only');
    expect(getFirestoreApi).not.toHaveBeenCalled();
  });

  it('loads grades from Firestore and caches them locally', async () => {
    const onStatus = vi.fn();
    const doc = vi.fn().mockReturnValue({ path: 'key-123/dsk' });
    vi.mocked(getFirestoreApi).mockResolvedValue({
      db: {},
      doc,
      getDoc: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ b: { grade: 'B' } }),
      }),
      setDoc: vi.fn(),
    });
    const result = await firestore.fetchAllGrades({
      collectionKey: 'key-123',
      setCode: 'dsk',
      localGrades: { a: { grade: 'A' } },
      onStatus,
    });
    expect(result).toEqual({ grades: { b: { grade: 'B' } }, cloudSync: true });
    expect(doc).toHaveBeenCalledWith({}, 'key-123', 'dsk');
    expect(localStorage.getItem('scryfallCardGraderGrades:dsk')).toBe('{"b":{"grade":"B"}}');
    expect(onStatus).toHaveBeenLastCalledWith('Synced');
  });

  it('returns an empty grade map when the snapshot does not exist', async () => {
    vi.mocked(getFirestoreApi).mockResolvedValue({
      db: {},
      doc: vi.fn(),
      getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
      setDoc: vi.fn(),
    });
    const result = await firestore.fetchAllGrades({
      collectionKey: 'key-123',
      setCode: 'dsk',
      localGrades: { a: { grade: 'A' } },
      onStatus: vi.fn(),
    });
    expect(result.grades).toEqual({});
  });
});

describe('fetchCollectionMetadata', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getFirestoreApi).mockReset();
  });

  it('returns the metadata document when it exists', async () => {
    const doc = vi.fn().mockReturnValue({ path: 'key-123/metadata' });
    vi.mocked(getFirestoreApi).mockResolvedValue({
      db: {},
      doc,
      getDoc: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ description: 'My sealed draft pod' }),
      }),
      setDoc: vi.fn(),
    });
    const result = await firestore.fetchCollectionMetadata('key-123');
    expect(result).toEqual({ description: 'My sealed draft pod' });
    expect(doc).toHaveBeenCalledWith({}, 'key-123', firestore.METADATA_DOCUMENT_ID);
  });

  it('returns null when the metadata document is missing', async () => {
    vi.mocked(getFirestoreApi).mockResolvedValue({
      db: {},
      doc: vi.fn(),
      getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
      setDoc: vi.fn(),
    });
    expect(await firestore.fetchCollectionMetadata('key-123')).toBeNull();
  });

  it('returns null without a collection key', async () => {
    expect(await firestore.fetchCollectionMetadata('')).toBeNull();
    expect(getFirestoreApi).not.toHaveBeenCalled();
  });

  it('returns null when the read throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getFirestoreApi).mockResolvedValue({
      db: {},
      doc: vi.fn(),
      getDoc: vi.fn().mockRejectedValue(new Error('offline')),
      setDoc: vi.fn(),
    });
    expect(await firestore.fetchCollectionMetadata('key-123')).toBeNull();
    consoleError.mockRestore();
  });
});

describe('persistGrades', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getFirestoreApi).mockReset();
  });

  it('saves locally and stays local without a collection key', async () => {
    const onStatus = vi.fn();
    const grades = { a: { grade: 'A' } };
    const ok = await firestore.persistGrades({
      collectionKey: null,
      setCode: 'dsk',
      grades,
      onStatus,
    });
    expect(ok).toBe(true);
    expect(localStorage.getItem('scryfallCardGraderGrades:dsk')).toBe(JSON.stringify(grades));
    expect(onStatus).toHaveBeenCalledWith('Local only');
    expect(getFirestoreApi).not.toHaveBeenCalled();
  });

  it('writes the grades document to Firestore', async () => {
    const onStatus = vi.fn();
    const setDoc = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ path: 'key-123/dsk' });
    vi.mocked(getFirestoreApi).mockResolvedValue({ db: {}, doc, setDoc, getDoc: vi.fn() });
    const grades = { a: { grade: 'A' } };
    const ok = await firestore.persistGrades({
      collectionKey: 'key-123',
      setCode: 'dsk',
      grades,
      onStatus,
    });
    expect(ok).toBe(true);
    expect(doc).toHaveBeenCalledWith({}, 'key-123', 'dsk');
    expect(setDoc).toHaveBeenCalledWith({ path: 'key-123/dsk' }, grades);
    expect(onStatus).toHaveBeenLastCalledWith('Synced');
  });

  it('reports failure when the write throws', async () => {
    const onStatus = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getFirestoreApi).mockResolvedValue({
      db: {},
      doc: vi.fn(),
      setDoc: vi.fn().mockRejectedValue(new Error('offline')),
      getDoc: vi.fn(),
    });
    const ok = await firestore.persistGrades({
      collectionKey: 'key-123',
      setCode: 'dsk',
      grades: {},
      onStatus,
    });
    expect(ok).toBe(false);
    expect(onStatus).toHaveBeenLastCalledWith('Local only (sync failed)');
    consoleError.mockRestore();
  });
});