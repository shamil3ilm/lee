/**
 * Skill levels 0–5 (v13 §2, §3.1), derived from rating bands. Level 0 means
 * "no evidence yet": no placement seed and no attempt. Pure, client-safe.
 */

export const LEVEL_NAMES = ['Unassessed', 'Novice', 'Beginner', 'Competent', 'Proficient', 'Expert'] as const
export type Level = 0 | 1 | 2 | 3 | 4 | 5

/** Lower rating bound of levels 2–5 (below the first = Novice). */
export const LEVEL_FLOORS: Readonly<Record<2 | 3 | 4 | 5, number>> = {
  2: 1200,
  3: 1400,
  4: 1600,
  5: 1800,
}

/** The level the Playground may suggest "interview-ready" at (never sets it). */
export const READY_SUGGESTION_LEVEL: Level = 3

export function levelForRating(rating: number): Exclude<Level, 0> {
  if (rating >= LEVEL_FLOORS[5]) return 5
  if (rating >= LEVEL_FLOORS[4]) return 4
  if (rating >= LEVEL_FLOORS[3]) return 3
  if (rating >= LEVEL_FLOORS[2]) return 2
  return 1
}

export function levelOf(r: { rating: number; assessed: boolean }): Level {
  return r.assessed ? levelForRating(r.rating) : 0
}

export function levelName(level: number): string {
  return LEVEL_NAMES[Math.max(0, Math.min(5, Math.round(level)))] ?? LEVEL_NAMES[0]
}

export function isLevel(n: number): n is Level {
  return Number.isInteger(n) && n >= 0 && n <= 5
}
