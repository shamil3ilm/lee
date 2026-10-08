import * as relQ from '@/lib/db/queries/discoveryRelevance'
import { normalizeTitle } from './learned'

/**
 * "Did we filter something useful?" The week's top distinct titles the
 * domain rule filtered, with counts, for Discovery's Filtered tab and the
 * weekly digest. DB only; one bounded query.
 */

export const REVIEW_DAYS = 7
export const REVIEW_SIZE = 5

export interface ReviewItem {
  /** Normalised title (the learned-titles key). */
  key: string
  /** One example title as posted. */
  title: string
  /** "Marketing" from "domain: Marketing". */
  domain: string
  count: number
  ids: string[]
}

/** Pure grouping, so the selection is testable without a DB. */
export function selectReview(rows: readonly relQ.FilteredByDomain[], size = REVIEW_SIZE): ReviewItem[] {
  const groups = new Map<string, ReviewItem>()
  for (const r of rows) {
    if (!r.title) continue
    const key = normalizeTitle(r.title)
    if (!key) continue
    const domain = (r.reason ?? '').replace(/^domain:\s*/, '').split(' · ')[0] ?? ''
    const g = groups.get(key)
    if (g) {
      g.count += 1
      g.ids.push(r.id)
    } else groups.set(key, { key, title: r.title, domain, count: 1, ids: [r.id] })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, size)
}

export async function domainFilterReview(userId: string, now: Date = new Date()): Promise<ReviewItem[]> {
  const since = new Date(now.getTime() - REVIEW_DAYS * 24 * 60 * 60 * 1000)
  return selectReview(await relQ.filteredByDomainSince(userId, since))
}
