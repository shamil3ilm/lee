import type { AcademyContent } from '@/lib/academy/content/catalog'
import type { Item } from '@/lib/academy/content/schema'
import { expectedScore } from '@/lib/academy/rating'

/**
 * Pick the item for a skill that maximises learning value (v13 §3.3): the
 * expected success closest to the target (≈0.65–0.75, the zone of proximal
 * development), penalising items done recently. Deterministic. Pure.
 */

export const TARGET_SUCCESS = 0.7
export const STRETCH_SUCCESS = 0.6
export const DIAGNOSTIC_SUCCESS = 0.5

function recencyPenalty(itemId: string, recent: readonly string[]): number {
  const i = recent.indexOf(itemId)
  if (i < 0) return 0
  return i < 5 ? 1 : 0.5
}

export function chooseItem(
  content: AcademyContent,
  skillId: string,
  rating: number,
  recentItemIds: readonly string[],
  targetSuccess: number = TARGET_SUCCESS,
  exclude: ReadonlySet<string> = new Set(),
): Item | null {
  const items = (content.itemsBySkill.get(skillId) ?? []).filter((i) => !exclude.has(i.id))
  let best: Item | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const item of items) {
    const score = Math.abs(expectedScore(rating, item.difficulty) - targetSuccess) + recencyPenalty(item.id, recentItemIds)
    if (score < bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

/** Minutes an item takes in the plan: par time plus reading the feedback. */
export function itemMinutes(item: Pick<Item, 'parSec'>): number {
  return Math.ceil(item.parSec / 60) + 1
}
