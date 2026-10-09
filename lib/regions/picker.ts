import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import { allNodes, isWithin, shortName } from './tree'
import type { RegionSelection } from './selection'

/**
 * Pure helpers behind the region picker (components/regions): search over
 * names, aliases and areas, and the trigger's summary text.
 */

export interface RegionSearchHit {
  id: string
  /** The spelling that matched when it is not the name ("Cochin", "Infopark"). */
  matched: string | null
}

/**
 * Nodes within `roots` whose name, alias or area matches `query`
 * (case- and accent-insensitive): name prefixes first, then other prefixes,
 * then substrings; at most `limit`.
 */
export function searchRegions(query: string, roots: readonly string[], limit = 30): RegionSearchHit[] {
  const q = normalizeForMatch(query)
  if (q.length === 0) return []
  const scored: Array<RegionSearchHit & { rank: number; name: string }> = []
  for (const n of allNodes()) {
    if (!roots.some((r) => isWithin(n.id, r))) continue
    const name = normalizeForMatch(n.name)
    const spellings = [...n.aliases, ...(n.areas ?? []).flatMap((a) => [a.name, ...a.aliases])]
    if (name.startsWith(q)) scored.push({ id: n.id, matched: null, rank: 0, name: n.name })
    else {
      const prefix = spellings.find((s) => normalizeForMatch(s).startsWith(q))
      const inside = name.includes(q) ? n.name : spellings.find((s) => normalizeForMatch(s).includes(q))
      if (prefix) scored.push({ id: n.id, matched: prefix, rank: 1, name: n.name })
      else if (inside) scored.push({ id: n.id, matched: inside === n.name ? null : inside, rank: 2, name: n.name })
    }
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ id, matched }) => ({ id, matched }))
}

/** "Kerala, Dubai", "Kerala, Dubai +2", or `empty` when nothing is selected. */
export function selectionSummary(selection: RegionSelection, empty: string, max = 2): string {
  if (selection.length === 0) return empty
  const names = selection.map(shortName)
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} +${names.length - max}` : shown
}
