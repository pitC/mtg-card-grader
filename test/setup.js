const store = new Map();

const localStorageMock = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  key(index) {
    return [...store.keys()][index] ?? null;
  },
  removeItem(key) {
    store.delete(key);
  },
  setItem(key, value) {
    store.set(String(key), String(value));
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});