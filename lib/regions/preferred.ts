import { z } from 'zod'
import { isRegionId, isWithin, shortName } from './tree'

/**
 * Starred ("preferred") regions: a ranking boost, never a filter. The user
 * stars regions in Settings › Search at one of two levels; unstarred
 * regions keep their normal weight. Hierarchical like the selection:
 * starring a country covers its cities, starring a city covers that city
 * only. When several stars cover a place, the highest level wins.
 * Client-safe, pure.
 */

export const PREFERRED_LEVELS = ['top', 'preferred'] as const
export type PreferredLevel = (typeof PREFERRED_LEVELS)[number]

export const PREFERRED_LEVEL_LABELS: Readonly<Record<PreferredLevel, string>> = {
  top: 'Top priority',
  preferred: 'Preferred',
}

export interface PreferredRegion {
  id: string
  level: PreferredLevel
}

export const MAX_PREFERRED = 8

export const preferredRegionSchema = z.object({
  id: z.string().min(1).max(60),
  level: z.enum(PREFERRED_LEVELS),
})

/** Points each surface adds for a starred place (top, preferred). */
export const PREFERRED_BOOST = {
  /** Match Score: added to the region component. */
  match: { top: 5, preferred: 3 },
  /** Daily shortlist rank. */
  rank: { top: 6, preferred: 4 },
  /** Company discovery fit. */
  company: { top: 10, preferred: 6 },
} as const satisfies Record<string, Record<PreferredLevel, number>>

/** Known ids only, one entry per id (the first wins), at most MAX_PREFERRED. */
export function normalizePreferred(values: readonly unknown[]): PreferredRegion[] {
  const out: PreferredRegion[] = []
  for (const v of values) {
    const p = preferredRegionSchema.safeParse(v)
    if (!p.success || !isRegionId(p.data.id) || out.some((o) => o.id === p.data.id)) continue
    out.push(p.data)
    if (out.length >= MAX_PREFERRED) break
  }
  return out
}

/** Form values "kw:top", "ae:preferred" → entries. */
export function parsePreferredValues(values: readonly string[]): PreferredRegion[] {
  return normalizePreferred(
    values.map((v) => {
      const [id = '', level = 'preferred'] = v.split(':')
      return { id: id.trim(), level: level.trim() }
    }),
  )
}

export interface PreferredHit {
  /** The starred node that covers the place. */
  id: string
  level: PreferredLevel
  /** "Preferred: Kuwait". */
  label: string
}

const RANK: Readonly<Record<PreferredLevel, number>> = { top: 2, preferred: 1 }

/**
 * The best star covering any of a posting's / company's places, or null.
 * Ties between equal levels go to the more specific star (Dubai over UAE).
 */
export function preferredHit(placeIds: Iterable<string>, starred: readonly PreferredRegion[]): PreferredHit | null {
  if (starred.length === 0) return null
  const ids = [...placeIds].filter(isRegionId)
  let best: PreferredRegion | null = null
  for (const s of starred) {
    if (!ids.some((id) => isWithin(id, s.id))) continue
    if (!best || RANK[s.level] > RANK[best.level] || (RANK[s.level] === RANK[best.level] && isWithin(s.id, best.id))) best = s
  }
  return best ? { id: best.id, level: best.level, label: `Preferred: ${shortName(best.id)}` } : null
}

/** Points for a hit on a given surface. */
export function preferredPoints(hit: PreferredHit | null, surface: keyof typeof PREFERRED_BOOST): number {
  return hit ? PREFERRED_BOOST[surface][hit.level] : 0
}
