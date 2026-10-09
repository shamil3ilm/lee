import { anyWithin, withAncestors } from '@/lib/regions/tree'
import { GULF_INDIA_TZ, mergeScans, type PlaceScan } from './places'
import { openWorldwide, windowFits } from './remote'
import { normalizeForMatch } from './text'

/**
 * The region-taxonomy ids stored on a posting (`discoveries.region_ids`):
 * the deepest places it names with every ancestor, and for a remote posting
 * "remote" plus its scopes (worldwide, APAC, EMEA, India-friendly hours).
 * Remote eligibility ("must be based in India") counts as a place.
 */

const WINDOW = 8_000
const INDIA_OFFSET = 5.5
const ASIA_COUNTRIES = ['in', 'sg', 'my', 'jp', 'pk', 'lk', 'bd', 'np']
const APAC_WORDS = /\b(?:apac|asia[\s-]?pacific|south asia|asia)\b/
const EMEA_WORDS = /\b(?:emea|europe|european|middle east|mena|gcc|gulf)\b/
const EMEA_FOREIGN = ['EU', 'GB', 'IE', 'MEA_OTHER']

export interface RegionIdsInput {
  /** Location field and title, where a posting states where it is. */
  placeText: string
  description: string | null | undefined
  located: PlaceScan
  restricted: PlaceScan
  remote: boolean
}

function remoteScopes(i: RegionIdsInput, nodes: readonly string[]): string[] {
  const scan = mergeScans(i.located, i.restricted)
  const place = normalizeForMatch(i.placeText)
  const description = (i.description ?? '').slice(0, WINDOW)
  const out = ['remote']
  if (scan.worldwide || openWorldwide(i.description)) out.push('remote-worldwide')
  if (APAC_WORDS.test(place) || ASIA_COUNTRIES.some((c) => anyWithin(nodes, c))) out.push('remote-apac')
  if (EMEA_WORDS.test(place) || EMEA_FOREIGN.some((c) => scan.foreign.has(c)) || anyWithin(nodes, 'gcc') || anyWithin(nodes, 'europe')) {
    out.push('remote-emea')
  }
  const tz = GULF_INDIA_TZ.test(normalizeForMatch(`${i.placeText}\n${description}`)) || windowFits(`${i.placeText}\n${description}`, INDIA_OFFSET) === true
  if (anyWithin(nodes, 'in') || tz) out.push('remote-india-tz')
  return out
}

export function postingRegionIds(i: RegionIdsInput): string[] {
  const nodes = [...i.located.nodes, ...(i.remote ? i.restricted.nodes : [])]
  const ids = withAncestors(nodes)
  return i.remote ? [...ids, ...remoteScopes(i, nodes).filter((s) => !ids.includes(s))] : ids
}
