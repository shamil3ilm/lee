import { resolveLocation, type ResolvedPlace } from './normalize'
import { ROOT_ORDER } from './taxonomy'
import { childrenOf, countryOf, getNode, nodeName, primaryChain, shortName } from './tree'

/**
 * Display helpers: the most specific label for a posting's location
 * ("Kochi, Kerala · Infopark", "Dubai, UAE · DIFC"), its region chain for
 * the hover title ("Kochi › Kerala › India") and region group counts for
 * Discovery's "group by region" summary. Pure and client-safe.
 */

/** "Kochi, Kerala", "Dubai, UAE", "Kerala, India", "UAE". */
export function placeName(id: string): string {
  const n = getNode(id)
  if (!n) return id
  if (n.kind === 'country' || n.kind === 'group' || n.kind === 'remote') return n.kind === 'country' ? shortName(id) : n.name
  const country = countryOf(id)
  const parent = n.parents[0] ? getNode(n.parents[0]) : undefined
  // In India the state (or Delhi NCR) says more than the country; elsewhere the country does.
  const context =
    country === 'in' && parent && parent.kind !== 'country' && !parent.name.startsWith(n.name)
      ? parent.name
      : country
        ? shortName(country)
        : null
  return context && context !== n.name ? `${n.name}, ${context}` : n.name
}

export function placeLabel(place: ResolvedPlace): string {
  return place.area ? `${placeName(place.id)} · ${place.area}` : placeName(place.id)
}

/** "Kochi › Kerala › India". */
export function chainLabel(id: string): string {
  return primaryChain(id).map(nodeName).join(' › ')
}

export interface LocationDisplay {
  /** Most specific label of the first place, or the raw text when nothing is known. */
  label: string
  /** Region chain(s) for the hover title; null when nothing is known. */
  chain: string | null
  /** How many more places the posting names. */
  more: number
}

/** Display for a posting location string; falls back to the text as written. */
export function locationDisplay(location: string | null | undefined): LocationDisplay | null {
  const text = location?.trim()
  if (!text) return null
  const { places } = resolveLocation(text, { trustCodes: true })
  const first = places[0]
  if (!first) return { label: text, chain: null, more: 0 }
  return {
    label: placeLabel(first),
    chain: places.map((p) => chainLabel(p.id)).join('\n'),
    more: places.length - 1,
  }
}

export interface RegionGroup {
  id: string
  name: string
  count: number
  children: RegionGroup[]
}

/**
 * Region counts as a tree (GCC → country → city; India → state → city),
 * from per-id counts (each posting counts at every ancestor, as stored).
 * Only nodes with postings appear; at most `depth` levels.
 */
export function regionGroups(counts: ReadonlyMap<string, number>, depth = 3): RegionGroup[] {
  const build = (id: string, level: number): RegionGroup | null => {
    const count = counts.get(id) ?? 0
    if (count <= 0) return null
    const children =
      level < depth
        ? childrenOf(id)
            .map((c) => build(c, level + 1))
            .filter((g): g is RegionGroup => g !== null)
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        : []
    return { id, name: shortName(id), count, children }
  }
  return ROOT_ORDER.map((id) => build(id, 1)).filter((g): g is RegionGroup => g !== null)
}
