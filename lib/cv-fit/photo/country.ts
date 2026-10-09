import { isRemotePosting, postingPlaces } from '@/lib/discovery/relevance/gate'
import { anyWithin, countryOf, shortName } from '@/lib/regions/tree'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'

/**
 * The job's country, as far as photo conventions go (from the location
 * field and the title only: a description names too many places).
 *   gcc     UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman
 *   avoid   US, UK, Canada, Australia/NZ, Ireland, the Netherlands
 *   india   India
 *   dach    Germany, Austria, Switzerland
 *   europe  elsewhere in Europe
 *   remote  a remote posting with no place
 */

export type PhotoCountryKind = 'gcc' | 'avoid' | 'india' | 'dach' | 'europe' | 'remote' | 'unknown'

export interface PhotoCountry {
  kind: PhotoCountryKind
  label: string
}

export interface CountryInput {
  title: string
  location?: string | null
  remoteType?: string | null
}

const AVOID_FOREIGN: Readonly<Record<string, string>> = { US: 'the US', CA: 'Canada', GB: 'the UK', IE: 'Ireland', AU: 'Australia / NZ' }
const NETHERLANDS = ['netherlands', 'the netherlands', 'holland', 'amsterdam', 'rotterdam', 'the hague', 'utrecht', 'eindhoven']
const DACH = [
  'germany', 'deutschland', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'stuttgart', 'düsseldorf',
  'austria', 'vienna', 'wien', 'switzerland', 'zurich', 'zürich', 'geneva', 'basel', 'bern', 'lausanne',
].map((t) => normalizeForMatch(t))

export function photoCountry(job: CountryInput): PhotoCountry {
  const places = postingPlaces({ title: job.title, location: job.location })
  const nodes = [...places.nodes]
  // Any GCC node (the group, a country, a city or a free zone) follows GCC conventions.
  if (anyWithin(nodes, 'gcc')) {
    const countries = [...new Set(nodes.map(countryOf).filter((c): c is string => c !== null && anyWithin([c], 'gcc')))]
    return { kind: 'gcc', label: countries.length > 0 ? countries.map(shortName).join(', ') : 'GCC' }
  }
  if (anyWithin(nodes, 'in')) return { kind: 'india', label: 'India' }
  const text = normalizeForMatch(`${job.location ?? ''} ${job.title}`)
  const avoid = [...places.foreign].find((c) => c in AVOID_FOREIGN)
  if (avoid) return { kind: 'avoid', label: AVOID_FOREIGN[avoid]! }
  if (findTerms(text, NETHERLANDS).length > 0) return { kind: 'avoid', label: 'the Netherlands' }
  if (findTerms(text, DACH).length > 0) return { kind: 'dach', label: 'Germany / Austria / Switzerland' }
  if (places.foreign.has('EU')) return { kind: 'europe', label: 'Europe' }
  if (isRemotePosting({ title: job.title, location: job.location, remoteType: job.remoteType })) return { kind: 'remote', label: 'Remote' }
  return { kind: 'unknown', label: 'Not stated' }
}
