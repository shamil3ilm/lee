import { isRemotePosting } from '../relevance/gate'
import {
  detectSeniority,
  detectYearsRequired,
  levelForYears,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  type SeniorityLevel,
} from '../relevance/seniority'
import { findTerms, normalizeForMatch } from '../relevance/text'
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

/**
 * A stretch above your level in one of your strong, ready areas costs half:
 * "Seniority: Senior (you target Junior–Mid-level) · strong payments match".
 */
export function seniorityComponent(
  job: MatchJob,
  p: Pick<MatchProfile, 'seniority' | 'years' | 'skills' | 'domains'>,
): MatchComponent {
  const base = seniorityBase(job, p)
  if (base.points >= base.max || !/\(you target|asks \d+\+ yrs, you have/.test(base.label)) return base
  const strength = strengthIn(
    `${job.title}
${(job.techStack ?? []).join(' ')}
${job.descriptionMd ?? ''}`,
    strengthsFrom(p.skills, p.domains),
  )
  if (!strength) return base
  return { ...base, points: base.points + Math.ceil((base.max - base.points) / 2), label: `${base.label} · strong ${strength} match` }
}

function seniorityBase(job: MatchJob, p: Pick<MatchProfile, 'seniority' | 'years'>): MatchComponent {
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

