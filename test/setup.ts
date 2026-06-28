/**
 * Vitest setup — runs once before any test file is evaluated.
 *
 * Bulletproof stand-ins for the browser globals that storage.ts touches at
 * call-time: localStorage.clear/removeItem/setItem and window.dispatchEvent.
 * Defined in pure JS (Map-backed) so they ARE available even if the active
 * vitest environment didn't ship a working Storage object.
 *
 * Note: globalThis.crypto is provided by Node 18+ and by happy-dom; we
 * don't try to reassign it (it's a getter on recent Node).
 */

type Listener = (event: { type: string; [k: string]: unknown }) => void

function makeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

function makeWindow(ls: Storage): Window {
  const listeners = new Map<string, Set<Listener>>()
  return {
    localStorage: ls,
    sessionStorage: ls,
    crypto: globalThis.crypto,
    dispatchEvent(event: Event) {
      const set = listeners.get(event.type)
      if (set) for (const fn of set) fn(event as unknown as { type: string })
      return true
    },
    addEventListener(type: string, fn: Listener | EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn as Listener)
    },
    removeEventListener(type: string, fn: Listener | EventListener) {
      listeners.get(type)?.delete(fn as Listener)
    },
  } as unknown as Window
}

const ls = makeLocalStorage()
const win = makeWindow(ls)

// Object.defineProperty dodges the "getter-only" restriction that Node
// imposes on `crypto` (and that browsers impose on `localStorage` in some
// configurations). Each binding is fresh per setup run, which is fine
// because vitest runs each file in its own module graph.
Object.defineProperty(globalThis, 'localStorage', {
  value: ls,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, 'window', {
  value: win,
  configurable: true,
  writable: true,
})
