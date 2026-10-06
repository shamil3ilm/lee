import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEVIATION,
  DEFAULT_RATING,
  MAX_DEVIATION,
  MIN_DEVIATION,
  decayDeviation,
  expectedScore,
  updateRating,
} from '@/lib/academy/rating'
import { LEVEL_NAMES, levelForRating, levelOf } from '@/lib/academy/levels'

describe('levels', () => {
  it('names levels 0–5 as the spec does', () => {
    expect(LEVEL_NAMES).toEqual(['Unassessed', 'Novice', 'Beginner', 'Competent', 'Proficient', 'Expert'])
  })

  it('derives a level from rating bands', () => {
    expect(levelForRating(1100)).toBe(1)
    expect(levelForRating(1250)).toBe(2)
    expect(levelForRating(1400)).toBe(3)
    expect(levelForRating(1599)).toBe(3)
    expect(levelForRating(1650)).toBe(4)
    expect(levelForRating(1900)).toBe(5)
  })

  it('is Unassessed until there is a seed or an attempt', () => {
    expect(levelOf({ rating: 1700, assessed: false })).toBe(0)
    expect(levelOf({ rating: 1700, assessed: true })).toBe(4)
  })
})

describe('Glicko-style rating', () => {
  it('expects 50% against an equal item and more against an easier one', () => {
    expect(expectedScore(1500, 1500, 60)).toBeCloseTo(0.5, 5)
    expect(expectedScore(1500, 1300, 60)).toBeGreaterThan(0.7)
  })

  it('raises the rating on success and lowers it on failure, shrinking deviation either way', () => {
    const start = { rating: 1500, deviation: 200 }
    const win = updateRating(start, { difficulty: 1500, outcome: 1 })
    const loss = updateRating(start, { difficulty: 1500, outcome: 0 })
    expect(win.rating).toBeGreaterThan(1500)
    expect(loss.rating).toBeLessThan(1500)
    expect(win.deviation).toBeLessThan(200)
    expect(loss.deviation).toBeLessThan(200)
    // Symmetric around an even match.
    expect(win.rating - 1500).toBeCloseTo(1500 - loss.rating, 5)
  })

  it('moves an uncertain rating further than a settled one', () => {
    const fresh = updateRating({ rating: DEFAULT_RATING, deviation: DEFAULT_DEVIATION }, { difficulty: 1400, outcome: 1 })
    const settled = updateRating({ rating: DEFAULT_RATING, deviation: 60 }, { difficulty: 1400, outcome: 1 })
    expect(fresh.rating - DEFAULT_RATING).toBeGreaterThan(settled.rating - DEFAULT_RATING)
  })

  it('beating an easy item gains less than beating a hard one', () => {
    const start = { rating: 1500, deviation: 150 }
    const easy = updateRating(start, { difficulty: 1200, outcome: 1 })
    const hard = updateRating(start, { difficulty: 1800, outcome: 1 })
    expect(hard.rating - 1500).toBeGreaterThan(easy.rating - 1500)
  })

  it('never lets deviation fall below the floor', () => {
    let r = { rating: 1500, deviation: 80 }
    for (let i = 0; i < 50; i++) r = updateRating(r, { difficulty: 1500, outcome: i % 2 })
    expect(r.deviation).toBeGreaterThanOrEqual(MIN_DEVIATION)
  })

  it('clamps the outcome to 0..1 and keeps the rating finite', () => {
    const r = updateRating({ rating: 1500, deviation: 200 }, { difficulty: 1500, outcome: 7 })
    expect(Number.isFinite(r.rating)).toBe(true)
    expect(r.rating).toBeCloseTo(updateRating({ rating: 1500, deviation: 200 }, { difficulty: 1500, outcome: 1 }).rating)
  })

  it('grows deviation with inactivity (skill decay), capped at the maximum', () => {
    expect(decayDeviation(60, 0)).toBe(60)
    expect(decayDeviation(60, 90)).toBeGreaterThan(60)
    expect(decayDeviation(60, 100_000)).toBe(MAX_DEVIATION)
    expect(decayDeviation(60, -5)).toBe(60)
  })
})
