import { matchedVia, migrateLegacyRegions, normalizeSelection, regionMatch, type RegionMatch } from '@/lib/regions/selection'
import { isRegionId, isWithin, shortName } from '@/lib/regions/tree'
import { foreignLabel, mergeScans, type PlaceScan } from './places'
import type { SearchPrefs } from './prefs'
import { homeOffset, openWorldwide, relocationOffered, relocationTarget, usHoursOnly, windowFits } from './remote'

/**
 * The location rule.
 *
 * On-site / hybrid: fail only when the posting names places and none is
 * accepted — unless it explicitly offers relocation or visa sponsorship and
 * the user is open to that ("Relocation offered · Germany" boost).
 * Acceptance is hierarchical (lib/regions/selection.ts): Kerala accepts a
 * Kochi posting, GCC any Gulf city; a posting broader than the selection
 * ("India" for a Kerala-only user) is never dropped.
 *
 * Remote ("can I do it from home?"): pass when eligibility names an
 * accepted place, a broad area covering it (EMEA, APAC, worldwide) or a
 * working-hours window within ±4 h of home; fail with the reason when it is
 * restricted elsewhere ("US-only", "US time zones only", "must reside in
 * the EU"); an unstated region is a soft "unclear eligibility" chip.
 */

export interface LocationOutcome {
  reason: string | null
  penalty: string | null
  boost: string | null
}

const PASS: LocationOutcome = { reason: null, penalty: null, boost: null }
const fail = (reason: string): LocationOutcome => ({ reason, penalty: null, boost: null })

export const UNCLEAR_REMOTE = 'remote: unclear eligibility'

/** What the user accepts: region-node ids (hierarchical) and ISO-2 / place-group codes. */
export interface Accepted {
  ids: readonly string[]
  codes: ReadonlySet<string>
}

/** Selected target regions + other accepted countries (+ extra ISO-2 codes, e.g. where the user lives). */
export function acceptedFor(
  prefs: Pick<SearchPrefs, 'regions' | 'otherCountries'> & Partial<Pick<SearchPrefs, 'regionIds'>>,
  extra: readonly string[] = [],
): Accepted {
  const others = [...prefs.otherCountries, ...extra]
  // Country codes alone (older callers) select those whole countries.
  const selected = prefs.regionIds && prefs.regionIds.length > 0 ? prefs.regionIds : migrateLegacyRegions(prefs.regions)
  return {
    ids: normalizeSelection([...selected, ...others.map((c) => c.toLowerCase()).filter(isRegionId)]),
    codes: new Set([...prefs.regions, ...others]),
  }
}

function isEmptyAccepted(a: Accepted): boolean {
  return a.ids.length === 0 && a.codes.size === 0
}

/** True when the scan names any place. */
export function namesPlaces(places: PlaceScan): boolean {
  return places.regions.size + places.covered.size + places.foreign.size + places.nodes.size > 0
}

/**
 * How the places relate to what the user accepts: a named node within a
 * selected one (or a foreign code they accept) → in; broader than the
 * selection → partial; otherwise out (none when nothing is named).
 */
export function acceptance(places: PlaceScan, accepted: Accepted): RegionMatch {
  const nodeIds = [...places.nodes, ...[...places.covered].map((c) => c.toLowerCase())]
  const byNode = regionMatch(nodeIds, accepted.ids)
  if (byNode === 'in') return 'in'
  if ([...places.foreign].some((c) => accepted.codes.has(c))) return 'in'
  if (byNode === 'none' && namesPlaces(places)) return 'out'
  return byNode
}

const passes = (m: RegionMatch): boolean => m === 'in' || m === 'partial'

/** The accepted node a scan matched through, for labels ("Kerala", "UAE"). */
export function acceptedVia(places: PlaceScan, accepted: Accepted): string | null {
  const nodeIds = [...places.nodes, ...[...places.covered].map((c) => c.toLowerCase())]
  const id = matchedVia(nodeIds, accepted.ids)
  if (id) return shortName(id)
  const code = [...places.foreign].find((c) => accepted.codes.has(c))
  return code ? foreignLabel(code, places.foreignNames.get(code)) : null
}

/** The place a reason names: a foreign label, else the first place outside the selection. */
export function firstForeign(places: PlaceScan, accepted?: Accepted): string {
  const code = [...places.foreign][0]
  if (code) return foreignLabel(code, places.foreignNames.get(code))
  const node = [...places.nodes].find((n) => !accepted || !accepted.ids.some((s) => isWithin(n, s)))
  if (node) return shortName(node)
  const region = [...places.regions][0]
  return region ?? 'elsewhere'
}

/** Home for working-hours checks: where the user lives, else their first region. */
function home(prefs: SearchPrefs): number | null {
  return homeOffset(prefs.extra.basedIn ?? prefs.regions[0] ?? null)
}

export interface LocationInput {
  located: PlaceScan
  restricted: PlaceScan
  remote: boolean
  /** Location field + description, for working-hours windows. */
  text: string
  description: string | null | undefined
}

function remoteOutcome(prefs: SearchPrefs, targets: Accepted, i: LocationInput): LocationOutcome {
  if (isEmptyAccepted(targets)) return prefs.remoteScope === 'none' ? fail('location: remote (you chose on-site)') : PASS
  // Remote work is done from home, so where the user lives always counts.
  const accepted = acceptedFor(prefs, prefs.extra.basedIn ? [prefs.extra.basedIn] : [])
  const eligible = mergeScans({ ...i.located, worldwide: false }, i.restricted)
  const named = namesPlaces(eligible)
  const hits = named && passes(acceptance(eligible, accepted))
  if (prefs.remoteScope === 'none') return hits ? PASS : fail('location: remote (you chose on-site)')
  if (hits) return PASS
  const window = windowFits(i.text, home(prefs))
  if (window === true) return PASS
  if (usHoursOnly(i.description)) return fail('location: US time zones only')
  if (named) return fail(`location: ${firstForeign(eligible, accepted)}-only`)
  if (window === false) return fail('location: working hours far from your time zone')
  if (prefs.remoteScope === 'regions') return fail('location: remote, region not stated')
  if (i.located.worldwide || i.restricted.worldwide || openWorldwide(i.description)) return PASS
  return { reason: null, penalty: UNCLEAR_REMOTE, boost: null }
}

function onsiteOutcome(prefs: SearchPrefs, accepted: Accepted, i: LocationInput): LocationOutcome {
  if (isEmptyAccepted(accepted) || !namesPlaces(i.located) || i.located.worldwide) return PASS
  if (passes(acceptance(i.located, accepted))) return PASS
  const { relocationIfSponsored, relocationCountries } = prefs.extra
  if (relocationIfSponsored && relocationOffered(i.description)) {
    const target = relocationTarget(i.located, relocationCountries)
    if (target) {
      return { reason: null, penalty: null, boost: `Relocation offered · ${foreignLabel(target, i.located.foreignNames.get(target))}` }
    }
  }
  return fail(`location: ${firstForeign(i.located, accepted)}`)
}

export function locationOutcome(prefs: SearchPrefs, i: LocationInput): LocationOutcome {
  const accepted = acceptedFor(prefs)
  return i.remote ? remoteOutcome(prefs, accepted, i) : onsiteOutcome(prefs, accepted, i)
}
