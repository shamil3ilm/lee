import { isRemotePosting, postingPlaces, scanRestrictions } from '../relevance/gate'
import { hitsAccepted, locationOutcome, UNCLEAR_REMOTE } from '../relevance/location-rule'
import { openWorldwide } from '../relevance/remote'
import { emptyScan, isRegionCode, mergeScans, regionLabel, type PlaceScan } from '../relevance/places'
import { EMPTY_PREFS, type SearchPrefs } from '../relevance/prefs'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Region fit (0–10), from the same location rule as the gate:
 *   on-site in your regions 10 · relocation offered elsewhere 6 ·
 *   worldwide 6 · not stated 5 · elsewhere 0;
 *   remote in your regions (or where you live) 10 · hours fit your time
 *   zone 9 · worldwide 8 · eligibility unclear 5 · restricted elsewhere 0.
 */

export const REGION_MAX = 10

type RegionProfile = Pick<MatchProfile, 'regions' | 'otherCountries' | 'remoteScope' | 'extra'>

function asPrefs(p: RegionProfile): SearchPrefs {
  return {
    ...EMPTY_PREFS,
    active: true,
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

function placeLabel(places: PlaceScan, accepted: ReadonlySet<string>): string {
  const code = [...places.regions, ...places.covered, ...places.foreign].find((x) => accepted.has(x))
  if (!code) return 'your regions'
  return isRegionCode(code) ? regionLabel(code) : code
}

export function regionComponent(job: MatchJob, p: RegionProfile): MatchComponent {
  const c = (points: number, label: string): MatchComponent => ({ key: 'region', label, points, max: REGION_MAX })
  const targets = new Set<string>([...p.regions, ...p.otherCountries])
  if (targets.size === 0) return c(5, 'Region: no target regions set')
  const located = postingPlaces(job)
  const remote = isRemotePosting(job)
  const restricted = remote ? scanRestrictions(job.descriptionMd) : emptyScan()
  const outcome = locationOutcome(asPrefs(p), {
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
    const home = new Set([...targets, ...(p.extra.basedIn ? [p.extra.basedIn] : [])])
    if (hitsAccepted(eligible, home)) return c(REGION_MAX, `Remote in ${placeLabel(eligible, home)}`)
    return c(9, 'Remote, hours fit your time zone')
  }
  if (outcome.boost) return c(6, outcome.boost)
  if (outcome.reason) return c(0, `Region: ${what(outcome.reason)} (outside your regions)`)
  const named = located.regions.size + located.covered.size + located.foreign.size > 0
  if (hitsAccepted(located, targets)) return c(REGION_MAX, `Region: ${placeLabel(located, targets)}`)
  if (located.worldwide) return c(6, 'Region: worldwide')
  return named ? c(5, 'Region: partly stated') : c(5, 'Region: location not stated')
}
