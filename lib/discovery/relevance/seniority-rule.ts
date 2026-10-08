import type { RuleMode } from './discovery-prefs'
import {
  isAboveSelected,
  levelForYears,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
  type SeniorityLevel,
} from './seniority'

/**
 * The seniority rule (user-switchable like the other rules):
 *   soft (default)  a Senior / Lead / Staff / Manager title or a years ask
 *                   above the selected levels only ranks lower; a strong
 *                   ready match (payments, ZATCA, Laravel…) halves that.
 *                   Principal, Director, Head of, VP / C-level and an
 *                   Architect asking 10+ years are still filtered.
 *   hard            any title or years ask above the selected levels is
 *                   filtered (the old behaviour).
 *   off             seniority is ignored.
 */

/** Levels that are filtered even in soft mode (unless selected). */
export const ALWAYS_FILTERED: readonly SeniorityLevel[] = ['principal', 'director', 'head', 'executive']

/** Rank points. A title stretch is −10, a 5+ years ask −10, a lighter years ask −3. */
export const SENIORITY_POINTS = { title: -10, belowTitle: -5, yearsStrong: -10, yearsLight: -3 } as const

export interface SeniorityInput {
  mode: RuleMode
  selected: readonly SeniorityLevel[]
  title: SeniorityLevel | null
  years: number | null
  architect: boolean
  /** The posting is in one of the profile's strong, ready areas ("payments"). */
  strength: string | null
}

export interface SeniorityOutcome {
  /** Filter reason ("seniority: Director"), or null. */
  hard: string | null
  /** Soft chip and its rank points, or null. */
  penalty: { label: string; points: number } | null
}

const NONE: SeniorityOutcome = { hard: null, penalty: null }
const RANK = new Map(SENIORITY_LEVELS.map((l, i) => [l, i] as const))
const rank = (l: SeniorityLevel): number => RANK.get(l) ?? 0

export function seniorityOutcome(i: SeniorityInput): SeniorityOutcome {
  if (i.mode === 'off' || i.selected.length === 0) return NONE
  const titleAbove = i.title !== null && !i.selected.includes(i.title) && isAboveSelected(i.title, i.selected)
  const titleBelow = i.title !== null && !i.selected.includes(i.title) && !titleAbove
  const yearsAbove = i.years !== null && isAboveSelected(levelForYears(i.years), i.selected)
  if (i.mode === 'hard') {
    if (i.title && !i.selected.includes(i.title)) return { hard: `seniority: ${SENIORITY_LABELS[i.title]}`, penalty: null }
    if (!i.title && yearsAbove) return { hard: `seniority: ${i.years}+ years required`, penalty: null }
    return NONE
  }
  if (i.title && ALWAYS_FILTERED.includes(i.title) && !i.selected.includes(i.title)) {
    return { hard: `seniority: ${SENIORITY_LABELS[i.title]}`, penalty: null }
  }
  if (i.architect && i.years !== null && i.years >= 10) return { hard: 'seniority: Architect, 10+ years', penalty: null }
  const parts: string[] = []
  let points = 0
  if (titleAbove) {
    parts.push(`${SENIORITY_LABELS[i.title!]} title`)
    points += SENIORITY_POINTS.title
  } else if (titleBelow) {
    parts.push(`${SENIORITY_LABELS[i.title!]} title`)
    points += SENIORITY_POINTS.belowTitle
  }
  if (yearsAbove) {
    parts.push(`${i.years}+ yrs asked`)
    points += i.years! >= 5 ? SENIORITY_POINTS.yearsStrong : SENIORITY_POINTS.yearsLight
  }
  if (parts.length === 0) return NONE
  if (i.strength && (titleAbove || yearsAbove)) {
    parts.push(`strong ${i.strength} match`)
    points = Math.round(points / 2)
  }
  return { hard: null, penalty: { label: parts.join(' · '), points } }
}

/** Architect titles (no seniority level of their own). */
export function isArchitectTitle(normalizedTitle: string): boolean {
  return /\barchitect\b/.test(normalizedTitle)
}

/** Lowest-to-highest order helper for callers that compare levels. */
export function seniorityRank(level: SeniorityLevel): number {
  return rank(level)
}
