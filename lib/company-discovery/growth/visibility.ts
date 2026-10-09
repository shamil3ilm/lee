import type { CompanyEvidence } from '../types'

/**
 * "Under the radar": not all great companies are well known. A company is
 * a hidden gem when it fits well and shows growth or hiring, yet has little
 * public visibility: no Wikidata item, no press found, few GitHub stars, no
 * famous-accelerator badge, not in the seed list of well-known names, and
 * not a large employer (1000+ people or 50+ open roles).
 * Pure, client-safe.
 */

export const GEM_MIN_FIT = 55
export const GEM_MIN_GROWTH = 60
/** Stars across an org's recent repos above which it counts as visible. */
export const VISIBLE_STARS = 200
/** Open roles at once that mark a large employer. */
export const LARGE_OPEN_ROLES = 50

export interface VisibilityInput {
  fitScore: number | null
  growthScore: number | null
  sourceTags: readonly string[]
  evidence: CompanyEvidence
}

export interface RadarVerdict {
  gem: boolean
  /** Why it is under the radar (and what makes it worth a look). */
  reasons: string[]
}

export function underTheRadar(c: VisibilityInput): RadarVerdict {
  const ev = c.evidence
  // A large employer (1000+ people, or 50+ open roles at once) is not a hidden gem even when no list names it.
  const large = (ev.employees ?? 0) >= 1000 || (ev.openRoles ?? 0) >= LARGE_OPEN_ROLES
  const visible =
    large ||
    !!ev.wikidataId ||
    (ev.news?.ev.length ?? 0) > 0 ||
    (ev.hn ? ev.hn.r + ev.hn.p : 0) >= 3 ||
    (ev.github?.stars ?? 0) >= VISIBLE_STARS ||
    !!ev.ycBatch ||
    c.sourceTags.includes('seed') ||
    c.sourceTags.includes('wikidata') ||
    c.sourceTags.includes('yc')
  const hiring = (ev.openRoles ?? 0) > 0 || (ev.jobsRecent30 ?? 0) > 0
  const growing = (c.growthScore ?? 0) >= GEM_MIN_GROWTH
  const gem = !visible && (c.fitScore ?? 0) >= GEM_MIN_FIT && (growing || hiring)
  if (!gem) return { gem: false, reasons: [] }
  const reasons = [
    'No Wikidata entry or press coverage found',
    ev.github ? `${ev.github.stars} GitHub stars` : null,
    growing ? `Growth ${c.growthScore}` : null,
    (ev.openRoles ?? 0) > 0 ? `${ev.openRoles} open roles` : (ev.jobsRecent30 ?? 0) > 0 ? `${ev.jobsRecent30} new postings in 30 days` : null,
  ].filter((x): x is string => x !== null)
  return { gem, reasons }
}
