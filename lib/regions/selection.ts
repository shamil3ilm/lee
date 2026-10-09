import { GCC_COUNTRY_IDS } from './taxonomy'
import { ancestorsOf, childrenOf, countryOf, descendantsOf, getNode, isRegionId, isWithin, primaryChain } from './tree'

/**
 * Selection semantics shared by Settings › Search, the Discovery and
 * Shortlist region filter, the gate, the Match Score, the shortlist rank and
 * the best-CV fit:
 *   - selecting a parent includes every descendant (GCC = the six countries
 *     and their cities; Kerala = Kochi + Trivandrum + Kozhikode + …);
 *   - selecting children narrows (Dubai alone is Dubai only);
 *   - unticking a child of a selected parent keeps its siblings.
 * A selection is a short list of node ids with no id under another.
 */

export type RegionSelection = readonly string[]

/** Known ids, deduplicated, without ids already covered by a selected ancestor. */
export function normalizeSelection(ids: Iterable<string>): string[] {
  const known = [...new Set([...ids].filter(isRegionId))]
  return known.filter((id) => !ancestorsOf(id).some((a) => known.includes(a)))
}

/** True when `id` or one of its ancestors is selected. */
export function isCovered(id: string, selection: RegionSelection): boolean {
  return selection.some((s) => isWithin(id, s))
}

/**
 * Tick or untick `id`. Unticking a node covered by a selected ancestor
 * replaces that ancestor with every sibling along the way down.
 */
export function toggleRegion(selection: RegionSelection, id: string): string[] {
  if (!isRegionId(id)) return [...selection]
  if (selection.includes(id)) return selection.filter((s) => s !== id)
  const ancestor = selection.find((s) => s !== id && isWithin(id, s))
  if (!ancestor) {
    // Ticking a parent replaces its selected descendants.
    return normalizeSelection([...selection.filter((s) => !isWithin(s, id)), id])
  }
  const path = primaryChain(id)
  const stop = path.indexOf(ancestor)
  const keep: string[] = []
  // Walk down from the ancestor: keep each level's other children.
  for (let i = stop; i > 0; i--) {
    const parent = path[i]!
    const next = path[i - 1]!
    keep.push(...childrenOf(parent).filter((c) => c !== next))
  }
  return normalizeSelection([...selection.filter((s) => s !== ancestor), ...keep])
}

/**
 * A quick pick: selected → removed; otherwise it replaces any selected
 * ancestor or descendant ("Kerala" while India is selected narrows India to
 * Kerala) and joins the rest of the selection.
 */
export function pickRegion(selection: RegionSelection, id: string): string[] {
  if (!isRegionId(id)) return [...selection]
  if (selection.includes(id)) return selection.filter((s) => s !== id)
  return normalizeSelection([...selection.filter((s) => !isWithin(s, id) && !isWithin(id, s)), id])
}

export type CheckState = 'checked' | 'indeterminate' | 'unchecked'

/** Picker state of a node: covered → checked; some descendant selected → indeterminate. */
export function checkState(id: string, selection: RegionSelection): CheckState {
  if (isCovered(id, selection)) return 'checked'
  const below = descendantsOf(id)
  return selection.some((s) => below.has(s)) ? 'indeterminate' : 'unchecked'
}

export type RegionMatch = 'in' | 'partial' | 'out' | 'none'

/**
 * How a posting's region ids relate to a selection:
 *   in       a posting place lies within a selected node (Kochi vs Kerala);
 *   partial  the posting is broader than the selection ("India" vs Kerala):
 *            it may be there, so it is never dropped, only ranked lower;
 *   out      it names places, none of them selected;
 *   none     it names no place.
 */
export function regionMatch(postingIds: Iterable<string>, selection: RegionSelection): RegionMatch {
  const ids = [...postingIds].filter(isRegionId)
  if (ids.length === 0) return 'none'
  if (ids.some((id) => isCovered(id, selection))) return 'in'
  // Broader only by the posting's deepest places: a Bengaluru posting also
  // stores "in", yet it is not "somewhere in India" for a Kerala search.
  const deepest = ids.filter((id) => !ids.some((o) => o !== id && ancestorsOf(o).includes(id)))
  if (deepest.some((id) => getNode(id)?.kind !== 'remote' && selection.some((s) => isWithin(s, id)))) return 'partial'
  return 'out'
}

/**
 * The node a match is labelled with: the posting's country, unless the user
 * narrowed below country level, then their narrower node ("UAE" for a GCC
 * search, "Kerala" for a Kerala search, "Dubai" for a Dubai one).
 */
export function matchedVia(postingIds: readonly string[], selection: RegionSelection): string | null {
  for (const id of postingIds) {
    const via = selection.find((s) => isWithin(id, s))
    if (!via) continue
    const country = countryOf(id)
    const narrowed = countryOf(via) !== null && countryOf(via) !== via
    return narrowed || !country ? via : country
  }
  return null
}

/** The selection with every descendant (for counts and SQL fallbacks). */
export function expandSelection(selection: RegionSelection): string[] {
  const out = new Set<string>()
  for (const s of selection) {
    if (!isRegionId(s)) continue
    out.add(s)
    for (const d of descendantsOf(s)) out.add(d)
  }
  return [...out]
}

/**
 * Countries a selection touches, as upper-case ISO-2: Kerala → IN, GCC → the
 * six. For consumers that think in countries (pay floors, AI prompts, the
 * work-authorisation rules).
 */
export function selectionCountries(selection: RegionSelection): string[] {
  const out = new Set<string>()
  for (const s of selection) {
    for (const id of [s, ...ancestorsOf(s), ...descendantsOf(s)]) {
      if (getNode(id)?.kind === 'country') out.add(id.toUpperCase())
    }
  }
  return [...out]
}

/** Old stored values (country codes "AE"/"IN", filter tags "ae"/"gcc"/"in"/"remote") → node ids. */
const LEGACY: Readonly<Record<string, string>> = { gcc: 'gcc', remote: 'remote' }

/**
 * Migrate a legacy region list losslessly: ISO-2 codes and the old tags map
 * to their node ids; all six GCC countries collapse to "gcc" (the same set).
 */
export function migrateLegacyRegions(values: Iterable<unknown>): string[] {
  const ids: string[] = []
  for (const v of values) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    const id = LEGACY[t.toLowerCase()] ?? (/^[A-Za-z]{2}$/.test(t) ? t.toLowerCase() : t)
    if (isRegionId(id) && !ids.includes(id)) ids.push(id)
  }
  const allGcc = GCC_COUNTRY_IDS.every((c) => ids.includes(c))
  const collapsed = allGcc ? [...ids.filter((id) => !GCC_COUNTRY_IDS.includes(id)), 'gcc'] : ids
  return normalizeSelection(collapsed)
}

/** URL value "kerala,dubai" (or a legacy "gcc") → a selection. */
export function parseRegionParam(raw: string | readonly string[] | null | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ''])
    .flatMap((r: string) => r.split(','))
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 40)
  return migrateLegacyRegions(parts)
}

export function serializeRegionParam(selection: RegionSelection): string {
  return normalizeSelection(selection).join(',')
}
