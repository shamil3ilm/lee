import { isRemotePosting } from '../relevance/gate'
import { parseJd, type ParsedJd } from './jd'
import {
  detectSeniority,
  levelForYears,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  type SeniorityLevel,
} from '../relevance/seniority'
import { strengthIn, strengthsFrom } from './strengths'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Seniority (0–15), region (0–10) and work mode (0–5); role (0–10) is in ./role.
 * Each reads the same detectors as the relevance gate, so the score and
 * the gate never disagree about what a posting is.
 */

export const FIT_MAX = { role: 10, seniority: 15, region: 10, workMode: 5 } as const

export { roleComponent } from './role'

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

/** Most a strong, ready area can add back to a seniority stretch. */
export const STRENGTH_OFFSET_MAX = 3

/**
 * A stretch above your level in one of your strong, ready areas costs a
 * little less (at most +3): "Seniority: Senior (you target Junior–Mid-level)
 * · strong payments match". Years asked come from the parsed JD (overall
 * or per must-have line: "2+ years as a data analyst", "1–3 years in X").
 */
export function seniorityComponent(
  job: MatchJob,
  p: Pick<MatchProfile, 'seniority' | 'years' | 'skills' | 'domains'>,
  jd: Pick<ParsedJd, 'years'> = parseJd(job),
): MatchComponent {
  const base = seniorityBase(job, p, jd.years)
  if (base.points >= base.max || !/\(you target|asks \d+\+ yrs, you have/.test(base.label)) return base
  const strength = strengthIn(
    `${job.title}
${(job.techStack ?? []).join(' ')}
${job.descriptionMd ?? ''}`,
    strengthsFrom(p.skills, p.domains),
  )
  if (!strength) return base
  const offset = Math.min(STRENGTH_OFFSET_MAX, Math.ceil((base.max - base.points) / 2))
  return { ...base, points: base.points + offset, label: `${base.label} · strong ${strength} match` }
}

type Read = MatchComponent

function titleRead(title: SeniorityLevel, targets: readonly SeniorityLevel[], c: (points: number, label: string) => Read): Read {
  const max = FIT_MAX.seniority
  const name = SENIORITY_LABELS[title]
  if (targets.length === 0) return c(10, `Seniority: ${name}`)
  if (targets.includes(title)) return c(max, `Seniority: ${name} fits`)
  const top = Math.max(...targets.map(rank))
  const bottom = Math.min(...targets.map(rank))
  if (rank(title) < bottom) return c(8, `Seniority: ${name}, below ${rangeLabel(targets)}`)
  return c(rank(title) - top === 1 ? 4 : 0, `Seniority: ${name} (you target ${rangeLabel(targets)})`)
}

/**
 * Years asked vs years you have: full points within a year of the ask,
 * otherwise falling off faster than the ratio, (you / asked)^1.5: 2 years
 * for "5+" earns 4 of 15, 3 for "5+" earns 7.
 */
function yearsRead(years: number, p: Pick<MatchProfile, 'seniority' | 'years'>, targets: readonly SeniorityLevel[], c: (points: number, label: string) => Read): Read {
  const max = FIT_MAX.seniority
  if (p.years !== null) {
    const label = `Seniority: asks ${years}+ yrs, you have ${p.years}`
    if (years <= p.years + 1) return c(max, label)
    return c(Math.round(max * Math.pow(Math.max(0, p.years) / years, 1.5)), label)
  }
  if (targets.length === 0) return c(10, `Seniority: asks ${years}+ yrs`)
  const fits = rank(levelForYears(years)) <= Math.max(...targets.map(rank))
  return c(fits ? 13 : 3, `Seniority: asks ${years}+ yrs`)
}

function seniorityBase(job: MatchJob, p: Pick<MatchProfile, 'seniority' | 'years'>, years: number | null): MatchComponent {
  const max = FIT_MAX.seniority
  const c = (points: number, label: string): MatchComponent => ({ key: 'seniority', label, points, max })
  const targets = targetLevels(p)
  const title = detectSeniority(job.title)
  const reads = [title ? titleRead(title, targets, c) : null, years !== null ? yearsRead(years, p, targets, c) : null].filter(
    (r): r is Read => r !== null,
  )
  if (reads.length === 0) return c(12, 'Seniority: not stated')
  // A title and a years ask: the stricter read wins (a Senior title asking 5+ years).
  return reads.reduce((a, b) => (b.points < a.points ? b : a))
}

export { regionComponent } from './region'

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

