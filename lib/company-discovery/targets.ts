import { expandSelection } from '@/lib/regions/selection'
import { ancestorsOf, isRegionId } from '@/lib/regions/tree'

/**
 * Places company discovery searches, per region-taxonomy node: the Wikidata
 * items a company's headquarters (P159) or country (P17) may point at, and
 * the GitHub `location:` terms orgs write in their profile. Client-safe.
 *
 * QIDs checked live on 2026-10-09 (query.wikidata.org). Every emirate the
 * taxonomy names is covered; free zones (DIFC, ADGM, Dubai Internet City,
 * Dubai Silicon Oasis, in5, Hub71) resolve to their city through the
 * taxonomy's areas when a company's location text names them.
 */

export interface TargetPlace {
  /** Region-taxonomy node id. */
  id: string
  /** Wikidata items for the place (headquarters city, or the country). */
  wikidata: readonly string[]
  /** GitHub org `location:` search terms; empty = no org search at this level. */
  github: readonly string[]
  /** Country-level node: Wikidata matches P17 (country) too, not only P159. */
  country?: boolean
}

export const TARGET_PLACES: readonly TargetPlace[] = [
  // United Arab Emirates
  { id: 'ae', wikidata: ['Q878'], github: ['United Arab Emirates'], country: true },
  { id: 'dubai', wikidata: ['Q612'], github: ['Dubai'] },
  { id: 'abu-dhabi', wikidata: ['Q1519'], github: ['Abu Dhabi'] },
  { id: 'sharjah', wikidata: ['Q289693'], github: ['Sharjah'] },
  { id: 'ajman', wikidata: ['Q530171'], github: ['Ajman'] },
  { id: 'ras-al-khaimah', wikidata: [], github: ['Ras Al Khaimah'] },
  // Saudi Arabia
  { id: 'sa', wikidata: ['Q851'], github: ['Saudi Arabia', 'KSA'], country: true },
  { id: 'riyadh', wikidata: ['Q3692'], github: ['Riyadh'] },
  { id: 'jeddah', wikidata: ['Q374365'], github: ['Jeddah'] },
  { id: 'dammam', wikidata: ['Q160320'], github: ['Dammam', 'Khobar'] },
  // Qatar
  { id: 'qa', wikidata: ['Q846'], github: ['Qatar'], country: true },
  { id: 'doha', wikidata: ['Q3861'], github: ['Doha'] },
  // Kuwait
  { id: 'kw', wikidata: ['Q817'], github: ['Kuwait'], country: true },
  { id: 'kuwait-city', wikidata: ['Q35178'], github: [] },
  { id: 'salmiya', wikidata: ['Q3505782'], github: ['Salmiya'] },
  // Bahrain
  { id: 'bh', wikidata: ['Q398'], github: ['Bahrain'], country: true },
  { id: 'manama', wikidata: ['Q3882'], github: ['Manama'] },
  // Oman
  { id: 'om', wikidata: ['Q842'], github: ['Oman'], country: true },
  { id: 'muscat', wikidata: ['Q3826'], github: ['Muscat'] },
  // India: Kerala and the big tech cities (country-level India is too broad to list)
  { id: 'kerala', wikidata: ['Q1186'], github: ['Kerala'] },
  { id: 'kochi', wikidata: ['Q1800'], github: ['Kochi', 'Cochin'] },
  { id: 'thiruvananthapuram', wikidata: ['Q167715'], github: ['Trivandrum', 'Thiruvananthapuram'] },
  { id: 'kozhikode', wikidata: ['Q28729'], github: ['Kozhikode', 'Calicut'] },
  { id: 'bengaluru', wikidata: ['Q1355'], github: ['Bengaluru', 'Bangalore'] },
  { id: 'hyderabad', wikidata: ['Q1361'], github: ['Hyderabad'] },
  { id: 'chennai', wikidata: ['Q1352'], github: ['Chennai'] },
  { id: 'pune', wikidata: ['Q1538'], github: ['Pune'] },
]

const BY_ID = new Map(TARGET_PLACES.map((p) => [p.id, p] as const))

/** Wikidata QID → region node id (for mapping query rows back). */
export const QID_TO_REGION: ReadonlyMap<string, string> = new Map(
  TARGET_PLACES.flatMap((p) => p.wikidata.map((q) => [q, p.id] as const)),
)

/** Default when the user has chosen no regions yet: the GCC and Kerala. */
export const DEFAULT_TARGET_SELECTION: readonly string[] = ['gcc', 'kerala']

/**
 * The target places for a region selection (Settings › Search) plus the
 * starred regions: every listed place inside the selection, and the
 * country of a selected city (so a Dubai-only search still asks for UAE
 * companies). Starred places come first. India as a whole is not a place
 * here (too broad): it expands to the listed Indian cities.
 */
export function targetPlaces(selection: readonly string[], starred: readonly string[] = []): TargetPlace[] {
  const sel = selection.length > 0 ? selection : DEFAULT_TARGET_SELECTION
  const ids = new Set<string>()
  for (const id of expandSelection([...starred, ...sel])) if (BY_ID.has(id)) ids.add(id)
  for (const id of [...starred, ...sel]) {
    if (!isRegionId(id)) continue
    for (const a of ancestorsOf(id)) if (BY_ID.get(a)?.country) ids.add(a)
  }
  const starredSet = new Set(expandSelection(starred))
  const ordered = [...ids].sort((a, b) => Number(starredSet.has(b)) - Number(starredSet.has(a)))
  return ordered.map((id) => BY_ID.get(id)!)
}

/** GitHub location terms for the places, deduplicated, in order. */
export function githubLocations(places: readonly TargetPlace[]): Array<{ term: string; regionId: string }> {
  const seen = new Set<string>()
  const out: Array<{ term: string; regionId: string }> = []
  for (const p of places) {
    for (const term of p.github) {
      const k = term.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ term, regionId: p.id })
    }
  }
  return out
}
