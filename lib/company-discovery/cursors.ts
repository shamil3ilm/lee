/**
 * Incremental ingestion of paged lists (IT-park directories, GitHub org
 * search pages): a cursor per list, stored on the user's hidden "Local
 * companies" source (`config.cursors`), so a run that ran out of time or
 * page budget resumes where it stopped, and every page of a list comes
 * round. Pure, client-safe.
 */

export interface ListCursor {
  /** Next page to read (1-based). */
  next: number
  /** Last page the list reported on the latest read. */
  lastPage?: number
  /** When a full pass over the list last finished (ISO). */
  completedAt?: string
}

export type Cursors = Readonly<Record<string, ListCursor>>

const KEY = /^[a-z0-9:_ .-]{1,80}$/i

/** Lenient parse of the stored cursors (bad entries dropped). */
export function parseCursors(config: unknown): Record<string, ListCursor> {
  const raw = (config as { cursors?: unknown } | null)?.cursors
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, ListCursor> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEY.test(k) || !v || typeof v !== 'object') continue
    const c = v as Record<string, unknown>
    const next = typeof c.next === 'number' && Number.isInteger(c.next) && c.next >= 1 ? c.next : 1
    out[k] = {
      next,
      ...(typeof c.lastPage === 'number' && Number.isInteger(c.lastPage) && c.lastPage >= 1 ? { lastPage: c.lastPage } : {}),
      ...(typeof c.completedAt === 'string' ? { completedAt: c.completedAt.slice(0, 30) } : {}),
    }
  }
  return out
}

export interface PageResult<T> {
  items: T[]
  lastPage: number
}

export interface WalkResult<T> {
  items: T[]
  cursor: ListCursor
  pagesRead: number
  error?: string
}

/**
 * Read up to `maxPages` pages from the cursor on, wrapping after the last
 * page (a full pass sets `completedAt`) but never reading a page twice in
 * one run. Stops early when `timeLeft()` says so or a page fails (the
 * cursor then stays on the failed page, so the next run retries it).
 */
export async function walkPages<T>(
  cursor: ListCursor | undefined,
  maxPages: number,
  fetchPage: (page: number) => Promise<PageResult<T>>,
  opts: { timeLeft?: () => boolean; now?: Date; errorText?: (e: unknown) => string } = {},
): Promise<WalkResult<T>> {
  const items: T[] = []
  let next = cursor?.next ?? 1
  let lastPage = cursor?.lastPage
  let completedAt = cursor?.completedAt
  const seen = new Set<number>()
  let pagesRead = 0
  while (pagesRead < maxPages && !seen.has(next)) {
    if (opts.timeLeft && !opts.timeLeft()) break
    seen.add(next)
    try {
      const r = await fetchPage(next)
      items.push(...r.items)
      pagesRead += 1
      lastPage = Math.max(1, r.lastPage)
      if (next >= lastPage || r.items.length === 0) {
        next = 1
        completedAt = (opts.now ?? new Date()).toISOString()
      } else next += 1
    } catch (e) {
      const error = opts.errorText ? opts.errorText(e) : e instanceof Error ? e.message : String(e)
      return { items, cursor: { next, ...(lastPage ? { lastPage } : {}), ...(completedAt ? { completedAt } : {}) }, pagesRead, error }
    }
  }
  return { items, cursor: { next, ...(lastPage ? { lastPage } : {}), ...(completedAt ? { completedAt } : {}) }, pagesRead }
}
