/**
 * Glicko-1 ratings (v13 §3.1): each skill has a rating and a deviation
 * (uncertainty). Each attempt is one "game" against the item, whose
 * difficulty is its rating with a small fixed deviation until 13.6
 * calibrates items from attempts. Deviation shrinks with evidence and grows
 * with inactivity (skill decay). Pure.
 */

export const DEFAULT_RATING = 1400
export const DEFAULT_DEVIATION = 350
export const MAX_DEVIATION = 350
export const MIN_DEVIATION = 50
/** Built-in items are hand-rated; treat them as fairly certain opponents. */
export const ITEM_DEVIATION = 60
/** Per-day growth (c² in Glicko): a settled 50 drifts back to 350 in ~2 years idle. */
const DECAY_C2_PER_DAY = (MAX_DEVIATION ** 2 - MIN_DEVIATION ** 2) / 730

const Q = Math.LN10 / 400

export interface Rating {
  rating: number
  deviation: number
}

function g(deviation: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * deviation * deviation) / (Math.PI * Math.PI))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Probability of success against an item of `difficulty` (Glicko E). */
export function expectedScore(rating: number, difficulty: number, itemDeviation = ITEM_DEVIATION): number {
  return 1 / (1 + 10 ** ((-g(itemDeviation) * (rating - difficulty)) / 400))
}

export interface Outcome {
  difficulty: number
  /** 1 = solved, 0 = failed; partial credit in between. */
  outcome: number
  itemDeviation?: number
}

/** The rating after one attempt (new object). */
export function updateRating(current: Rating, o: Outcome): Rating {
  const rd = clamp(current.deviation, MIN_DEVIATION, MAX_DEVIATION)
  const itemRd = o.itemDeviation ?? ITEM_DEVIATION
  const s = clamp(Number.isFinite(o.outcome) ? o.outcome : 0, 0, 1)
  const gj = g(itemRd)
  const e = expectedScore(current.rating, o.difficulty, itemRd)
  const dSquaredInv = Q * Q * gj * gj * e * (1 - e)
  const denom = 1 / (rd * rd) + dSquaredInv
  const rating = current.rating + (Q / denom) * gj * (s - e)
  const deviation = clamp(Math.sqrt(1 / denom), MIN_DEVIATION, MAX_DEVIATION)
  return { rating: Math.round(rating * 10) / 10, deviation: Math.round(deviation * 10) / 10 }
}

/** Deviation after `days` without practice. */
export function decayDeviation(deviation: number, days: number): number {
  if (!(days > 0)) return deviation
  return Math.round(Math.min(MAX_DEVIATION, Math.sqrt(deviation * deviation + DECAY_C2_PER_DAY * days)) * 10) / 10
}

const DAY_MS = 86_400_000

/** A stored rating as of `now`: deviation decayed for the idle time since practice. */
export function ratingAsOf(r: Rating & { lastPracticedAt: Date | null }, now: Date): Rating {
  if (!r.lastPracticedAt) return { rating: r.rating, deviation: r.deviation }
  const days = (now.getTime() - r.lastPracticedAt.getTime()) / DAY_MS
  return { rating: r.rating, deviation: decayDeviation(r.deviation, days) }
}
