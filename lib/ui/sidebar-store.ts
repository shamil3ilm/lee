/**
 * Client-side persistence for sidebar UI preferences (rail mode + group
 * collapse state). Per-viewer conveniences only, so every storage access is
 * wrapped in try/catch and falls back to defaults when storage throws.
 *
 * `localStorage` does not fire `storage` events in the same tab, so writes
 * notify an in-memory listener set that `useSyncExternalStore` subscribes to.
 */

export const RAIL_STORAGE_KEY = 'employ:sidebar-rail'
export const GROUPS_STORAGE_KEY = 'employ:sidebar-groups'
export const APP_SHELL_ID = 'app-shell'

const listeners = new Set<() => void>()

export function subscribeSidebar(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === RAIL_STORAGE_KEY || e.key === GROUPS_STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function notify(): void {
  for (const l of listeners) l()
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage disabled / private mode → preference is session-only */
  }
}

export function getRailSnapshot(): boolean {
  return read(RAIL_STORAGE_KEY) === '1'
}

export function getRailServerSnapshot(): boolean {
  return false
}

/** Mirror the rail flag onto the app shell so CSS variants resize the grid. */
export function applyRailAttribute(rail: boolean): void {
  const shell = document.getElementById(APP_SHELL_ID)
  if (!shell) return
  if (rail) shell.setAttribute('data-sidebar', 'rail')
  else shell.removeAttribute('data-sidebar')
}

export function setRail(rail: boolean): void {
  write(RAIL_STORAGE_KEY, rail ? '1' : '0')
  applyRailAttribute(rail)
  notify()
}

export function getGroupsSnapshot(): string | null {
  return read(GROUPS_STORAGE_KEY)
}

export function getGroupsServerSnapshot(): string | null {
  return null
}

export function setGroupsRaw(value: string): void {
  write(GROUPS_STORAGE_KEY, value)
  notify()
}

/**
 * Inline script run during HTML parsing (before first paint) so a persisted
 * rail preference never causes a layout shift on hard navigations.
 */
export const RAIL_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  RAIL_STORAGE_KEY,
)})==="1"){var s=document.getElementById(${JSON.stringify(
  APP_SHELL_ID,
)});if(s)s.setAttribute("data-sidebar","rail")}}catch(e){}})()`
