import { isRemotePosting, postingPlaces, scanRestrictions } from '../relevance/gate'
import { acceptance, acceptedFor, acceptedVia, locationOutcome, namesPlaces, UNCLEAR_REMOTE } from '../relevance/location-rule'
import { openWorldwide } from '../relevance/remote'
import { emptyScan, mergeScans } from '../relevance/places'
import { EMPTY_PREFS, type SearchPrefs } from '../relevance/prefs'
import { migrateLegacyRegions } from '@/lib/regions/selection'
import { shortName } from '@/lib/regions/tree'
import { preferredHit, preferredPoints, PREFERRED_BOOST } from '@/lib/regions/preferred'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Region fit (0–10), from the same location rule as the gate, matched
 * through the region hierarchy (lib/regions: Kerala includes Kochi, GCC
 * every Gulf city):
 *   on-site in your regions 10 · broader than your selection ("India" for
 *   a Kerala-only search) 7 · relocation offered elsewhere 6 · worldwide 6 ·
 *   not stated 5 · elsewhere 0;
 *   remote in your regions (or where you live) 10 · hours fit your time
 *   zone 9 · worldwide 8 · eligibility unclear 5 · restricted elsewhere 0.
 * A place inside a STARRED region (lib/regions/preferred) adds +5 (top
 * priority) or +3 (preferred) on top, with a "Preferred: Kuwait" label; the
 * component's max grows by the same amount, so unstarred regions are never
 * penalised.
 */

export const REGION_MAX = 10
export const REGION_BROADER = 7

type RegionProfile = Pick<MatchProfile, 'regionIds' | 'regions' | 'otherCountries' | 'remoteScope' | 'extra'>

/** In-region points plus the starred-region boost, if the place is starred. */
function inRegion(places: Iterable<string>, p: RegionProfile, label: string): MatchComponent {
  const hit = preferredHit(places, p.extra.preferredRegions ?? [])
  const boost = preferredPoints(hit, 'match')
  return hit
    ? { key: 'region', label: `${label} · ${hit.label}`, points: REGION_MAX + boost, max: REGION_MAX + PREFERRED_BOOST.match.top }
    : { key: 'region', label, points: REGION_MAX, max: REGION_MAX }
}

function asPrefs(p: RegionProfile): SearchPrefs {
  const regionIds = p.regionIds && p.regionIds.length > 0 ? [...p.regionIds] : migrateLegacyRegions(p.regions)
  return {
    ...EMPTY_PREFS,
    active: true,
    regionIds,
    regions: [...p.regions],
    otherCountries: [...p.otherCountries],
    remoteScope: p.remoteScope,
    extra: {
      ...EMPTY_PREFS.extra,
      basedIn: p.extra.basedIn,
      relocationIfSponsored: p.extra.relocationIfSponsored,
      relocationCountries: [...p.extra.relocationCountries],
    },
  }
}

export function regionComponent(job: MatchJob, p: RegionProfile): MatchComponent {
  const c = (points: number, label: string): MatchComponent => ({ key: 'region', label, points, max: REGION_MAX })
  const prefs = asPrefs(p)
  const targets = acceptedFor(prefs)
  if (targets.ids.length === 0 && targets.codes.size === 0) return c(5, 'Region: no target regions set')
  const located = postingPlaces(job)
  const remote = isRemotePosting(job)
  const restricted = remote ? scanRestrictions(job.descriptionMd) : emptyScan()
  const outcome = locationOutcome(prefs, {
    located,
    restricted,
    remote,
    text: `${job.location ?? ''}\n${(job.descriptionMd ?? '').slice(0, 8_000)}`,
    description: job.descriptionMd,
  })
  const what = (reason: string): string => reason.replace(/^location: /, '')
  if (remote) {
    if (outcome.reason) return c(0, `Remote: ${what(outcome.reason)}`)
    if (outcome.penalty === UNCLEAR_REMOTE) return c(5, 'Remote, eligibility unclear')
    if (located.worldwide || restricted.worldwide || openWorldwide(job.descriptionMd)) return c(8, 'Remote, worldwide')
    const eligible = mergeScans({ ...located, worldwide: false }, restricted)
    const home = acceptedFor(prefs, p.extra.basedIn ? [p.extra.basedIn] : [])
    // Remote work is done from home: "Remote, India" suits a Kerala-only search too.
    const where = acceptance(eligible, home)
    if (where === 'in' || where === 'partial') {
      const label = acceptedVia(eligible, home) ?? ([...eligible.nodes][0] ? shortName([...eligible.nodes][0]!) : 'your regions')
      return inRegion(eligible.nodes, p, `Remote in ${label}`)
    }
    return c(9, 'Remote, hours fit your time zone')
  }
  if (outcome.boost) return c(6, outcome.boost)
  if (outcome.reason) return c(0, `Region: ${what(outcome.reason)} (outside your regions)`)
  const fit = acceptance(located, targets)
  if (fit === 'in') return inRegion(located.nodes, p, `Region: ${acceptedVia(located, targets) ?? 'your regions'}`)
  if (fit === 'partial') {
    const broad = [...located.nodes][0]
    return c(REGION_BROADER, `Region: ${broad ? shortName(broad) : 'broader area'} (city not stated)`)
  }
  if (located.worldwide) return c(6, 'Region: worldwide')
  return namesPlaces(located) ? c(5, 'Region: partly stated') : c(5, 'Region: location not stated')
}
