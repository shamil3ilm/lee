/**
 * Pure helpers behind every kanban board: locate an item, move it between
 * columns immutably (optimistic update) and build the key that tells a
 * board its server data changed. No React, no dnd-kit — unit tested.
 */
export interface BoardItem {
  id: string
  /** Changes when the item's visible fields change (e.g. updatedAt). */
  version?: string
}

export type Grouped<C extends string, T> = Record<C, readonly T[]>

export function findColumn<C extends string, T extends BoardItem>(
  grouped: Grouped<C, T>,
  columns: readonly C[],
  itemId: string,
): C | null {
  for (const c of columns) {
    if ((grouped[c] ?? []).some((i) => i.id === itemId)) return c
  }
  return null
}

export function findItem<C extends string, T extends BoardItem>(
  grouped: Grouped<C, T>,
  columns: readonly C[],
  itemId: string,
): { item: T; column: C } | null {
  for (const c of columns) {
    const item = (grouped[c] ?? []).find((i) => i.id === itemId)
    if (item) return { item, column: c }
  }
  return null
}

/**
 * Returns a new grouping with `itemId` moved from `from` to the top of `to`.
 * `transform` lets the caller update the item for its new column (e.g. set
 * `status`). Unknown ids or a same-column move return the input unchanged.
 */
export function moveItem<C extends string, T extends BoardItem>(
  grouped: Grouped<C, T>,
  itemId: string,
  from: C,
  to: C,
  transform?: (item: T, to: C) => T,
): Grouped<C, T> {
  if (from === to) return grouped
  const source = grouped[from] ?? []
  const item = source.find((i) => i.id === itemId)
  if (!item) return grouped
  const moved = transform ? transform(item, to) : item
  return {
    ...grouped,
    [from]: source.filter((i) => i.id !== itemId),
    [to]: [moved, ...(grouped[to] ?? [])],
  }
}

/** Stable signature of the server data: column → ids (+ versions). */
export function groupedKey<C extends string, T extends BoardItem>(
  grouped: Grouped<C, T>,
  columns: readonly C[],
): string {
  return columns
    .map((c) => `${c}:${(grouped[c] ?? []).map((i) => (i.version ? `${i.id}@${i.version}` : i.id)).join(',')}`)
    .join('|')
}

/** Group a flat list by a column resolver; unknown columns are dropped. */
export function groupBy<C extends string, T>(
  items: readonly T[],
  columns: readonly C[],
  columnOf: (item: T) => C | null,
): Record<C, T[]> {
  const out = Object.fromEntries(columns.map((c) => [c, [] as T[]])) as Record<C, T[]>
  for (const item of items) {
    const c = columnOf(item)
    if (c !== null && c in out) out[c].push(item)
  }
  return out
}

export type WipState = 'none' | 'ok' | 'at' | 'over'

/** WIP hint for a column: under, at, or over its soft limit. */
export function wipState(count: number, limit: number | undefined): WipState {
  if (!limit || limit <= 0) return 'none'
  if (count > limit) return 'over'
  if (count === limit) return 'at'
  return 'ok'
}
