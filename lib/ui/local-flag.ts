/**
 * Tiny `useSyncExternalStore`-compatible boolean flag backed by localStorage.
 * Every storage access is guarded: when storage throws the flag reads `false`
 * and writes are session-only (the in-memory override still applies).
 */
export interface LocalFlag {
  subscribe: (listener: () => void) => () => void
  get: () => boolean
  getServer: () => boolean
  set: (value: boolean) => void
}

export function createLocalFlag(key: string): LocalFlag {
  const listeners = new Set<() => void>()
  let memory: boolean | null = null

  const get = (): boolean => {
    if (memory !== null) return memory
    try {
      return window.localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get,
    getServer: () => false,
    set(value) {
      memory = value
      try {
        window.localStorage.setItem(key, value ? '1' : '0')
      } catch {
        /* storage unavailable → in-memory only */
      }
      for (const l of listeners) l()
    },
  }
}
