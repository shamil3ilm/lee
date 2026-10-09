import { z } from 'zod'
import type { ImportItem, Readiness, ReviewSection, ReviewSelection } from './types'

/**
 * Client-safe, pure. The selection model behind the import review: which
 * items are ticked and which ticked items the user marked "Mine — I can
 * explain it". Every function returns a new selection.
 *
 * Defaults: new items ticked; duplicates and updates unticked (an update
 * stays "keep mine" until the user takes the imported version); every
 * readiness "Not ready / learning".
 */

export type SectionState = 'all' | 'some' | 'none'

export function initialSelection(items: readonly ImportItem[]): ReviewSelection {
  return { picked: items.filter((i) => i.status === 'new').map((i) => i.key), mine: [] }
}

function inSection(items: readonly ImportItem[], section: ReviewSection): ImportItem[] {
  return items.filter((i) => i.section === section)
}

/** The section checkbox: all / some / none of its items ticked. */
export function sectionState(items: readonly ImportItem[], sel: ReviewSelection, section: ReviewSection): SectionState {
  const keys = inSection(items, section).map((i) => i.key)
  const on = keys.filter((k) => sel.picked.includes(k)).length
  if (keys.length === 0 || on === 0) return 'none'
  return on === keys.length ? 'all' : 'some'
}

/** Mine is only kept for ticked items. */
function normalize(picked: readonly string[], mine: readonly string[]): ReviewSelection {
  const p = [...new Set(picked)]
  return { picked: p, mine: [...new Set(mine)].filter((k) => p.includes(k)) }
}

export function setItem(sel: ReviewSelection, key: string, on: boolean): ReviewSelection {
  const picked = on ? [...sel.picked, key] : sel.picked.filter((k) => k !== key)
  return normalize(picked, sel.mine)
}

/** Tick or untick every item in a section (the tri-state section checkbox). */
export function setSection(items: readonly ImportItem[], sel: ReviewSelection, section: ReviewSection, on: boolean): ReviewSelection {
  const keys = new Set(inSection(items, section).map((i) => i.key))
  const rest = sel.picked.filter((k) => !keys.has(k))
  return normalize(on ? [...rest, ...keys] : rest, sel.mine)
}

/** Skills chips: invert the ticks within a section. */
export function invertSection(items: readonly ImportItem[], sel: ReviewSelection, section: ReviewSection): ReviewSelection {
  const keys = inSection(items, section).map((i) => i.key)
  const on = new Set(sel.picked)
  const rest = sel.picked.filter((k) => !keys.includes(k))
  return normalize([...rest, ...keys.filter((k) => !on.has(k))], sel.mine)
}

export function setReadiness(sel: ReviewSelection, key: string, readiness: Readiness): ReviewSelection {
  const mine = readiness === 'mine' ? [...sel.mine, key] : sel.mine.filter((k) => k !== key)
  return normalize(sel.picked, mine)
}

export function readinessOf(sel: ReviewSelection, key: string): Readiness {
  return sel.mine.includes(key) ? 'mine' : 'learning'
}

export function pickedItems(items: readonly ImportItem[], sel: ReviewSelection): ImportItem[] {
  const on = new Set(sel.picked)
  return items.filter((i) => on.has(i.key))
}

export function pickedCount(items: readonly ImportItem[], sel: ReviewSelection, section?: ReviewSection): number {
  return pickedItems(items, sel).filter((i) => section === undefined || i.section === section).length
}

export const reviewSelectionSchema = z.object({
  picked: z.array(z.string().max(60)).max(600),
  mine: z.array(z.string().max(60)).max(600),
})

/**
 * Server side: parse a client selection and keep only keys of items the
 * server itself built (statuses are never taken from the client).
 */
export function cleanSelection(items: readonly ImportItem[], raw: unknown): ReviewSelection | null {
  const parsed = reviewSelectionSchema.safeParse(raw)
  if (!parsed.success) return null
  const known = new Set(items.map((i) => i.key))
  const readiness = new Set(items.filter((i) => i.hasReadiness).map((i) => i.key))
  return normalize(
    parsed.data.picked.filter((k) => known.has(k)),
    parsed.data.mine.filter((k) => readiness.has(k)),
  )
}
