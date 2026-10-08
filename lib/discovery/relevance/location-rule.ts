import { foreignLabel, mergeScans, type PlaceScan, type RegionCode } from './places'
import type { SearchPrefs } from './prefs'
import { homeOffset, openWorldwide, relocationOffered, relocationTarget, usHoursOnly, windowFits } from './remote'

/**
 * The location rule.
 *
 * On-site / hybrid: fail only when the posting names places and none is
 * accepted — unless it explicitly offers relocation or visa sponsorship and
 * the user is open to that ("Relocation offered · Germany" boost).
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

/** Selected target regions + other accepted ISO-2 countries. */
export function acceptedCodes(prefs: SearchPrefs): Set<string> {
  return new Set<string>([...prefs.regions, ...prefs.otherCountries])
}

export function hitsAccepted(places: PlaceScan, accepted: ReadonlySet<string>): boolean {
  for (const c of places.regions) if (accepted.has(c)) return true
  for (const c of places.covered) if (accepted.has(c)) return true
  for (const c of places.foreign) if (accepted.has(c)) return true
  return false
}

export function firstForeign(places: PlaceScan): string {
  const code = [...places.foreign][0]
  if (code) return foreignLabel(code, places.foreignNames.get(code))
  const region = [...places.regions][0] as RegionCode | undefined
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

function remoteOutcome(prefs: SearchPrefs, targets: ReadonlySet<string>, i: LocationInput): LocationOutcome {
  if (targets.size === 0) return prefs.remoteScope === 'none' ? fail('location: remote (you chose on-site)') : PASS
  // Remote work is done from home, so where the user lives always counts.
  const accepted = new Set([...targets, ...(prefs.extra.basedIn ? [prefs.extra.basedIn] : [])])
  const eligible = mergeScans({ ...i.located, worldwide: false }, i.restricted)
  const named = eligible.regions.size + eligible.covered.size + eligible.foreign.size > 0
  const hits = named && hitsAccepted(eligible, accepted)
  if (prefs.remoteScope === 'none') return hits ? PASS : fail('location: remote (you chose on-site)')
  if (hits) return PASS
  const window = windowFits(i.text, home(prefs))
  if (window === true) return PASS
  if (usHoursOnly(i.description)) return fail('location: US time zones only')
  if (named) return fail(`location: ${firstForeign(eligible)}-only`)
  if (window === false) return fail('location: working hours far from your time zone')
  if (prefs.remoteScope === 'regions') return fail('location: remote, region not stated')
  if (i.located.worldwide || i.restricted.worldwide || openWorldwide(i.description)) return PASS
  return { reason: null, penalty: UNCLEAR_REMOTE, boost: null }
}

function onsiteOutcome(prefs: SearchPrefs, accepted: ReadonlySet<string>, i: LocationInput): LocationOutcome {
  const named = i.located.regions.size + i.located.covered.size + i.located.foreign.size > 0
  if (accepted.size === 0 || !named || hitsAccepted(i.located, accepted) || i.located.worldwide) return PASS
  const { relocationIfSponsored, relocationCountries } = prefs.extra
  if (relocationIfSponsored && relocationOffered(i.description)) {
    const target = relocationTarget(i.located, relocationCountries)
    if (target) {
      return { reason: null, penalty: null, boost: `Relocation offered · ${foreignLabel(target, i.located.foreignNames.get(target))}` }
    }
  }
  return fail(`location: ${firstForeign(i.located)}`)
}

export function locationOutcome(prefs: SearchPrefs, i: LocationInput): LocationOutcome {
  const accepted = acceptedCodes(prefs)
  return i.remote ? remoteOutcome(prefs, accepted, i) : onsiteOutcome(prefs, accepted, i)
}
