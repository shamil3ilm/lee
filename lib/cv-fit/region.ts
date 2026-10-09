import { isRemotePosting, postingPlaces, type GateInput } from '@/lib/discovery/relevance/gate'
import { anyWithin } from '@/lib/regions/tree'
import { REGION_LABELS, type Region } from '@/lib/variants/types'

/**
 * Region fit of a variant for a job (0–15). The variant regions are résumé
 * conventions: GCC (nationality, visa, notice), India, and Remote / US / EU
 * (ATS-plain, no photo or personal data). A job maps to the convention its
 * readers expect:
 *   GCC country → gcc · India → india · remote, or an on-site job in the
 *   US / Canada / UK / Ireland / Europe / Australia → remote.
 *
 *   variant region is one of the job's    15
 *   job region not stated                  9
 *   Remote variant for a GCC / India job   6  (works, but misses local fields)
 *   GCC / India variant for a remote job   4  (personal fields a remote reader skips)
 *   GCC vs India                           0
 */

export const REGION_FIT_MAX = 15

const WESTERN = new Set(['US', 'CA', 'NA', 'GB', 'IE', 'EU', 'AU'])

/** Region-taxonomy roots whose postings read like US / EU résumés. */
const WESTERN_NODES = ['us', 'ca', 'gb', 'ie', 'europe', 'au', 'nz']

/**
 * Résumé conventions a job's readers expect, through the region hierarchy:
 * a GCC variant fits any GCC node (the group, a country, an emirate, a
 * city or a free zone); an India variant any India node.
 */
export function jobRegions(job: GateInput): Region[] {
  const places = postingPlaces(job)
  const nodes = [...places.nodes]
  const out: Region[] = []
  if (anyWithin(nodes, 'gcc')) out.push('gcc')
  if (anyWithin(nodes, 'in')) out.push('india')
  const western = [...places.foreign].some((c) => WESTERN.has(c)) || WESTERN_NODES.some((w) => anyWithin(nodes, w))
  if (isRemotePosting(job) || western) out.push('remote')
  return out
}

export interface RegionFit {
  points: number
  label: string
}

const SHORT: Readonly<Record<Region, string>> = { gcc: 'GCC', india: 'India', remote: 'Remote' }

/** "a GCC job", "an India job", "a remote / US / EU job". */
function aJob(region: Region): string {
  const word = region === 'remote' ? 'remote / US / EU' : SHORT[region]
  return `${/^[AEIOU]/i.test(word) ? 'an' : 'a'} ${word} job`
}

export function regionFit(variant: Region, regions: readonly Region[]): RegionFit {
  if (regions.length === 0) return { points: 9, label: 'Job region not stated' }
  if (regions.includes(variant)) return { points: REGION_FIT_MAX, label: `${SHORT[variant]} variant for ${aJob(variant)}` }
  const local = regions.find((r) => r !== 'remote')
  if (variant === 'remote' && local) {
    return { points: 6, label: `${REGION_LABELS[variant]} variant for ${aJob(local)} (no ${SHORT[local]} fields)` }
  }
  if (variant !== 'remote' && !local) return { points: 4, label: `${SHORT[variant]} variant for a remote job` }
  return { points: 0, label: `${SHORT[variant]} variant for ${aJob(local ?? 'remote')}` }
}
