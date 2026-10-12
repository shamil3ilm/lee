import type { ScreeningPath } from './types'

/**
 * Glue for pages that show screening chips: which rows get a path (postings
 * still in play: inbox, shortlist, applied) and attaching the loaded paths
 * to row view models without touching their other fields.
 */

const IN_PLAY: ReadonlySet<string> = new Set(['new', 'shortlisted', 'saved'])

export function screenIds(rows: ReadonlyArray<{ id: string; status: string }>): string[] {
  return rows.filter((r) => IN_PLAY.has(r.status)).map((r) => r.id)
}

export function withScreens<T extends { id: string }>(rows: readonly T[], screens: ReadonlyMap<string, ScreeningPath>): Array<T & { screen: ScreeningPath | null }> {
  return rows.map((r) => ({ ...r, screen: screens.get(r.id) ?? null }))
}

/** The same for a board's columns. */
export function withBoardScreens<K extends string, T extends { id: string }>(
  columns: Readonly<Record<K, T[]>>,
  screens: ReadonlyMap<string, ScreeningPath>,
): Record<K, Array<T & { screen: ScreeningPath | null }>> {
  return Object.fromEntries(Object.entries<T[]>(columns).map(([k, rows]) => [k, withScreens(rows, screens)])) as Record<
    K,
    Array<T & { screen: ScreeningPath | null }>
  >
}
