/**
 * XP per attempt (v13 §7): weighted by item difficulty and composite score,
 * with a small floor so an honest miss still counts as practice. Pure.
 */

export const XP_PER_REVIEW = 1
const BASE_XP = 10
const REFERENCE_DIFFICULTY = 1400

export function xpForAttempt(input: { difficulty: number; composite: number }): number {
  const difficulty = Math.max(0.5, input.difficulty / REFERENCE_DIFFICULTY)
  const quality = 0.3 + 0.7 * (Math.min(100, Math.max(0, input.composite)) / 100)
  return Math.max(1, Math.round(BASE_XP * difficulty * quality))
}
