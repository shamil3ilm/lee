import type { Industry } from '../industry'

/**
 * A seed-catalog entry: public facts only (name, website, the region
 * taxonomy places it has offices in, industry tags, other names it is
 * listed under). Client-safe data.
 *
 * The seed is a RECALL FLOOR, not the ceiling and never a ranking signal:
 * it makes sure well-known employers are not missed when a directory lists
 * them under a legal name (CareStack is "Good Methods Software Solutions" on
 * the Technopark list) or not at all. `source: 'seed'` adds no fit or growth
 * points, and a seed company does not count as "under the radar".
 */
export interface SeedCompany {
  name: string
  /** https homepage of the company's own domain. */
  website: string
  /** Region-taxonomy places (cities where known), most important first. */
  regionIds: readonly string[]
  industries: readonly Industry[]
  /** Other names directories list it under (legal entity, former brand). */
  aliases?: readonly string[]
  source: 'seed'
  /** What the live check found when it was not a clean answer (bot wall, server error). */
  note?: string
  /** yyyy-mm-dd the entry was last verified live (scripts/company-seed-verify.ts). */
  checkedOn: string
}
