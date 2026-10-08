import { hitsAccepted, firstForeign, isRemotePosting, postingPlaces, scanRestrictions } from '../relevance/gate'
import { isRegionCode, mergeScans, regionLabel, type PlaceScan } from '../relevance/places'
import { classifyRole, roleFamilyLabel } from '../relevance/roles'
import {
  detectSeniority,
  detectYearsRequired,
  levelForYears,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  type SeniorityLevel,
} from '../relevance/seniority'
import { findTerms, normalizeForMatch } from '../relevance/text'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Role family (0–15), seniority (0–15), region (0–10) and work mode (0–5).
 * Each reads the same detectors as the relevance gate, so the score and
 * the gate never disagree about what a posting is.
 */

export const FIT_MAX = { role: 15, seniority: 15, region: 10, workMode: 5 } as const

const CORE_FAMILIES = ['backend', 'fullstack', 'frontend']

export function roleComponent(job: MatchJob, p: Pick<MatchProfile, 'roleFamilies' | 'customRoles'>): MatchComponent {
  const max = FIT_MAX.role
  const role = classifyRole({ title: job.title, description: job.descriptionMd, techStack: job.techStack })
  const c = (points: number, label: string): MatchComponent => ({ key: 'role', label, points, max })
  const custom = p.customRoles.find((r) => findTerms(normalizeForMatch(job.title), [r]).length > 0)
  if (custom) return c(max, `Role: ${custom}`)
  const target = role.families.find((f) => p.roleFamilies.includes(f))
  if (target) return c(role.generic ? 12 : max, `Role: ${roleFamilyLabel(target)}`)
  if (!role.engineering) return c(0, 'Role: not engineering')
  if (p.roleFamilies.length === 0) return c(10, 'Role: engineering (no target roles set)')
  if (role.generic && role.families.length === 0 && p.roleFamilies.some((t) => CORE_FAMILIES.includes(t))) {
    return c(10, 'Role: general software engineering')
  }
  const other = role.families[0]
  return c(4, other ? `Role: ${roleFamilyLabel(other)} (not a target)` : 'Role: not a target role')
}

const RANK = new Map(SENIORITY_LEVELS.map((l, i) => [l, i] as const))
const rank = (l: SeniorityLevel): number => RANK.get(l) ?? 0

/** Targets from preferences, else the level the user's years suggest (± one step). */
function targetLevels(p: Pick<MatchProfile, 'seniority' | 'years'>): SeniorityLevel[] {
  if (p.seniority.length > 0) return [...p.seniority]
  if (p.years === null) return []
  const at = rank(levelForYears(Math.max(1, p.years)))
  return SENIORITY_LEVELS.filter((_, i) => Math.abs(i - at) <= 1 && i <= rank('senior'))
}

function rangeLabel(levels: readonly SeniorityLevel[]): string {
  const sorted = [...levels].sort((a, b) => rank(a) - rank(b))
  const lo = SENIORITY_LABELS[sorted[0]!]
  const hi = SENIORITY_LABELS[sorted[sorted.length - 1]!]
  return lo === hi ? lo : `${lo}–${hi}`
}

export function seniorityComponent(job: MatchJob, p: Pick<MatchProfile, 'seniority' | 'years'>): MatchComponent {
  const max = FIT_MAX.seniority
  const c = (points: number, label: string): MatchComponent => ({ key: 'seniority', label, points, max })
  const targets = targetLevels(p)
  const title = detectSeniority(job.title)
  const years = detectYearsRequired(job.descriptionMd)
  if (title) {
    const name = SENIORITY_LABELS[title]
    if (targets.length === 0) return c(10, `Seniority: ${name}`)
    if (targets.includes(title)) return c(max, `Seniority: ${name} fits`)
    const top = Math.max(...targets.map(rank))
    const bottom = Math.min(...targets.map(rank))
    if (rank(title) < bottom) return c(8, `Seniority: ${name}, below ${rangeLabel(targets)}`)
    return c(rank(title) - top === 1 ? 4 : 0, `Seniority: ${name} (you target ${rangeLabel(targets)})`)
  }
  if (years !== null) {
    if (p.years !== null) {
      const you = `you have ${p.years}`
      if (years <= p.years + 1) return c(max, `Seniority: asks ${years}+ yrs, ${you}`)
      if (years <= p.years + 3) return c(7, `Seniority: asks ${years}+ yrs, ${you}`)
      return c(0, `Seniority: asks ${years}+ yrs, ${you}`)
    }
    if (targets.length === 0) return c(10, `Seniority: asks ${years}+ yrs`)
    const fits = rank(levelForYears(years)) <= Math.max(...targets.map(rank))
    return c(fits ? 13 : 3, `Seniority: asks ${years}+ yrs`)
  }
  return c(12, 'Seniority: not stated')
}

function placeLabel(places: PlaceScan, accepted: ReadonlySet<string>): string {
  const code = [...places.regions, ...places.covered, ...places.foreign].find((x) => accepted.has(x))
  if (!code) return 'your regions'
  return isRegionCode(code) ? regionLabel(code) : code
}

export function regionComponent(
  job: MatchJob,
  p: Pick<MatchProfile, 'regions' | 'otherCountries' | 'remoteScope'>,
): MatchComponent {
  const max = FIT_MAX.region
  const c = (points: number, label: string): MatchComponent => ({ key: 'region', label, points, max })
  const accepted = new Set<string>([...p.regions, ...p.otherCountries])
  const located = postingPlaces(job)
  if (accepted.size === 0) return c(5, 'Region: no target regions set')
  if (isRemotePosting(job)) {
    const eligible = mergeScans({ ...located, worldwide: false }, scanRestrictions(job.descriptionMd))
    const named = eligible.regions.size + eligible.covered.size + eligible.foreign.size > 0
    const hits = named && hitsAccepted(eligible, accepted)
    if (p.remoteScope === 'none') return c(hits ? 6 : 0, hits ? `Remote in ${placeLabel(eligible, accepted)}` : 'Remote (you chose on-site)')
    if (!named) return p.remoteScope === 'regions' ? c(4, 'Remote, region not stated') : c(8, 'Remote, open to your region')
    return hits ? c(max, `Remote in ${placeLabel(eligible, accepted)}`) : c(0, `Remote, ${firstForeign(eligible)}-only`)
  }
  const named = located.regions.size + located.covered.size + located.foreign.size > 0
  if (!named && !located.worldwide) return c(5, 'Region: location not stated')
  if (hitsAccepted(located, accepted)) return c(max, `Region: ${placeLabel(located, accepted)}`)
  if (located.worldwide) return c(6, 'Region: worldwide')
  return c(0, `Region: ${firstForeign(located)} (outside your regions)`)
}

type Mode = 'remote' | 'hybrid' | 'onsite' | 'unknown'

function postingMode(job: MatchJob): Mode {
  if (job.remoteType === 'remote' || job.remoteType === 'hybrid' || job.remoteType === 'onsite') return job.remoteType
  if (/\bhybrid\b/i.test(`${job.title} ${job.location ?? ''}`)) return 'hybrid'
  if (isRemotePosting(job)) return 'remote'
  return 'unknown'
}

/** [preference][posting] → points. */
const MODE_POINTS: Readonly<Record<string, Readonly<Record<Exclude<Mode, 'unknown'>, number>>>> = {
  remote: { remote: 5, hybrid: 3, onsite: 0 },
  hybrid: { remote: 4, hybrid: 5, onsite: 2 },
  onsite: { remote: 2, hybrid: 3, onsite: 5 },
}

const MODE_LABEL: Readonly<Record<Exclude<Mode, 'unknown'>, string>> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

export function workModeComponent(job: MatchJob, p: Pick<MatchProfile, 'remotePref'>): MatchComponent {
  const max = FIT_MAX.workMode
  const mode = postingMode(job)
  if (mode === 'unknown') return { key: 'workMode', label: 'Work mode: not stated', points: 3, max }
  const table = MODE_POINTS[p.remotePref]
  const points = table ? table[mode] : max
  const note = table ? (points === max ? ' (your preference)' : ` (you prefer ${p.remotePref === 'onsite' ? 'on-site' : p.remotePref})`) : ''
  return { key: 'workMode', label: `Work mode: ${MODE_LABEL[mode]}${note}`, points, max }
}

