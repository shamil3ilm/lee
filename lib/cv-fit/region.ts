import { isRemotePosting, postingPlaces, type GateInput } from '@/lib/discovery/relevance/gate'
import { GCC_CODES } from '@/lib/discovery/relevance/places'
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

export function jobRegions(job: GateInput): Region[] {
  const places = postingPlaces(job)
  const out: Region[] = []
  if (GCC_CODES.some((c) => places.regions.has(c))) out.push('gcc')
  if (places.regions.has('IN')) out.push('india')
  if (isRemotePosting(job) || [...places.foreign].some((c) => WESTERN.has(c))) out.push('remote')
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
