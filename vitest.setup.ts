// jsdom 25's localStorage implementation needs a `--localstorage-file` Node
// flag to persist to disk; without it, `window.localStorage` is unusable in
// this Vitest/Node setup. zustand's `persist` middleware (used by
// shortcutsStore) reads/writes localStorage on every store change, so tests
// need a working implementation. This installs a minimal synchronous
// in-memory Storage polyfill, scoped to the test run only (not shipped to
// the app), so persist() has somewhere to write.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})
