/**
 * Discovery pagination helpers (pure; shared by the page and its tests).
 */

export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 50
/** Cookie that remembers the viewer's page size across visits. */
export const PAGE_SIZE_COOKIE = 'lee.discovery.pageSize'

export function parsePageSize(...candidates: ReadonlyArray<string | undefined | null>): PageSize {
  for (const c of candidates) {
    const n = Number(c)
    if ((PAGE_SIZES as readonly number[]).includes(n)) return n as PageSize
  }
  return DEFAULT_PAGE_SIZE
}

/** "1–50 of 734"; "0 results" when empty. */
export function rangeLabel(page: number, size: number, total: number): string {
  if (total === 0) return '0 results'
  const from = (page - 1) * size + 1
  const to = Math.min(total, page * size)
  return `${from.toLocaleString('en-US')}–${to.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`
}

export function pageCount(size: number, total: number): number {
  return Math.max(1, Math.ceil(total / size))
}

/**
 * Page numbers with ellipses: always the first and last page, and a window
 * of `siblings` around the current one, e.g. 1 … 4 5 [6] 7 8 … 15.
 */
export function pageItems(current: number, count: number, siblings = 1): Array<number | 'gap'> {
  if (count <= 5 + siblings * 2) return Array.from({ length: count }, (_, i) => i + 1)
  const start = Math.max(2, current - siblings)
  const end = Math.min(count - 1, current + siblings)
  const items: Array<number | 'gap'> = [1]
  if (start > 2) items.push('gap')
  for (let p = start; p <= end; p++) items.push(p)
  if (end < count - 1) items.push('gap')
  items.push(count)
  return items
}
