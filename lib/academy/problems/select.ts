import { expectedScore } from '@/lib/academy/rating'
import { TARGET_SUCCESS } from '@/lib/academy/selector/choose-item'
import { rng } from '@/lib/academy/runner/generate'

/**
 * The adaptive problem picker (v13 §3.3) for "pick one for me", the daily
 * problem and the coding plan item: the expected success against the
 * problem's rating closest to ~70%, preferring unsolved problems and
 * penalising ones seen recently. A seed picks among the best few so the
 * random button varies while the daily problem stays stable for a day. Pure.
 */

export interface PickableProblem {
  slug: string
  skillId: string
  rating: number
  kind: 'function' | 'sql'
}

export interface PickInputs {
  /** Current skill ratings (missing = 1400, the default). */
  ratings: ReadonlyMap<string, number>
  solved: ReadonlySet<string>
  /** Most recent first. */
  recent: readonly string[]
  exclude?: ReadonlySet<string>
  /** Restrict to skills (e.g. the weakest), when any problem matches. */
  skills?: ReadonlySet<string>
  kind?: 'function' | 'sql'
  seed: number
  /** Choose among this many best candidates (1 = deterministic best). */
  spread?: number
  targetSuccess?: number
}

const DEFAULT_RATING = 1400
const SOLVED_PENALTY = 0.6

export function problemScore(p: PickableProblem, inp: PickInputs): number {
  const rating = inp.ratings.get(p.skillId) ?? DEFAULT_RATING
  const fit = Math.abs(expectedScore(rating, p.rating) - (inp.targetSuccess ?? TARGET_SUCCESS))
  const seen = inp.recent.indexOf(p.slug)
  const recency = seen < 0 ? 0 : seen < 5 ? 1 : 0.4
  return fit + (inp.solved.has(p.slug) ? SOLVED_PENALTY : 0) + recency
}

export function pickProblem<P extends PickableProblem>(problems: readonly P[], inp: PickInputs): P | null {
  let pool = problems.filter((p) => !inp.exclude?.has(p.slug) && (!inp.kind || p.kind === inp.kind))
  if (inp.skills && inp.skills.size > 0) {
    const narrowed = pool.filter((p) => inp.skills?.has(p.skillId))
    if (narrowed.length > 0) pool = narrowed
  }
  if (pool.length === 0) return null
  const ranked = [...pool]
    .map((p) => ({ p, score: problemScore(p, inp) }))
    .sort((a, b) => a.score - b.score || a.p.slug.localeCompare(b.p.slug))
  const top = ranked.slice(0, Math.max(1, inp.spread ?? 1))
  const r = rng(inp.seed)
  return top[Math.floor(r() * top.length)]?.p ?? null
}

/** A stable numeric seed for a string (e.g. "2026-10-07:user"). */
export function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Consecutive days ending today (or yesterday, when today is not solved yet). */
export function dailyStreak(solvedDates: readonly string[], today: string): number {
  const set = new Set(solvedDates)
  const step = (day: string, delta: number): string => {
    const d = new Date(`${day}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }
  let day = set.has(today) ? today : step(today, -1)
  let streak = 0
  while (set.has(day)) {
    streak++
    day = step(day, -1)
  }
  return streak
}
