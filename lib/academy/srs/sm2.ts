/**
 * SM-2 spaced repetition for concept cards (v13 §5 "Flashcards"). The
 * classic algorithm: quality 0–5; below 3 restarts the card without changing
 * its ease; otherwise the interval climbs 1 → 6 → interval × ease. Pure.
 */

export const MIN_EASE = 1.3
export const INITIAL_EASE = 2.5
export const MAX_INTERVAL_DAYS = 365

export interface CardState {
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
}

export const INITIAL_CARD: Readonly<CardState> = Object.freeze({
  ease: INITIAL_EASE,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
})

export const GRADES = ['again', 'hard', 'good', 'easy'] as const
export type Grade = (typeof GRADES)[number]

/** The review buttons, as SM-2 qualities. */
export const GRADE_QUALITY: Readonly<Record<Grade, number>> = { again: 1, hard: 3, good: 4, easy: 5 }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** The card after one review of `quality` (new object). */
export function reviewCard(card: Readonly<CardState>, quality: number): CardState {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError(`SM-2 quality must be an integer 0–5, got ${quality}`)
  }
  if (quality < 3) {
    return { ease: card.ease, intervalDays: 1, repetitions: 0, lapses: card.lapses + 1 }
  }
  const repetitions = card.repetitions + 1
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.min(MAX_INTERVAL_DAYS, Math.round(card.intervalDays * card.ease))
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  const ease = Math.max(MIN_EASE, round2(card.ease + delta))
  return { ease, intervalDays: Math.min(MAX_INTERVAL_DAYS, intervalDays), repetitions, lapses: card.lapses }
}

const DAY_MS = 86_400_000

export function nextDue(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * DAY_MS)
}
