/**
 * Longest-prefix active-route matching for the sidebar.
 *
 * Every nav href is a candidate; the one that matches `pathname` (exactly or
 * as a `/`-delimited prefix) with the most characters wins. This stops a
 * parent entry (e.g. `/documents`) from lighting up alongside a more
 * specific sibling. `/` only matches the root exactly.
 */
export function pickActiveHref(pathname: string, hrefs: readonly string[]): string | null {
  if (pathname === '/') return hrefs.includes('/') ? '/' : null
  let best: string | null = null
  for (const h of hrefs) {
    if (h === '/') continue
    if (pathname === h || pathname.startsWith(`${h}/`)) {
      if (best === null || h.length > best.length) best = h
    }
  }
  return best
}

/** Collapse state for a group: `true` = open. Missing keys fall back to open. */
export type GroupOpenState = Record<string, boolean>

export function parseGroupState(raw: string | null): GroupOpenState {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: GroupOpenState = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * A group renders expanded when it contains the active route (always), or
 * when its persisted state is open / unset.
 */
export function isGroupOpen(
  key: string,
  state: GroupOpenState,
  containsActive: boolean,
): boolean {
  if (containsActive) return true
  return state[key] ?? true
}
