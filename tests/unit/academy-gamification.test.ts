import { describe, expect, it } from 'vitest'
import { xpForAttempt, XP_PER_REVIEW } from '@/lib/academy/gamification/xp'
import { nextStreak } from '@/lib/academy/gamification/streak'
import { RANK_LABELS, rankFor } from '@/lib/academy/gamification/rank'
import { newlyEarned, type AchievementStats } from '@/lib/academy/gamification/achievements'
import { addDays, daysBetween, localDay } from '@/lib/academy/day'
import { loadAcademyContent } from '@/lib/academy/content/catalog'

describe('local days', () => {
  it('uses the user time zone for "today"', () => {
    const late = new Date('2026-10-06T22:30:00Z')
    expect(localDay(late, 'UTC')).toBe('2026-10-06')
    expect(localDay(late, 'Asia/Dubai')).toBe('2026-10-07')
    expect(localDay(late, 'not/a-zone')).toBe('2026-10-06')
  })

  it('adds and diffs days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(daysBetween('2026-10-06', '2026-10-09')).toBe(3)
  })
})

describe('XP', () => {
  it('weights by difficulty and composite, with a floor for effort', () => {
    const hardPerfect = xpForAttempt({ difficulty: 1700, composite: 100 })
    const easyPerfect = xpForAttempt({ difficulty: 1200, composite: 100 })
    const failed = xpForAttempt({ difficulty: 1400, composite: 0 })
    expect(hardPerfect).toBeGreaterThan(easyPerfect)
    expect(failed).toBeGreaterThan(0)
    expect(failed).toBeLessThan(easyPerfect)
    expect(XP_PER_REVIEW).toBe(1)
  })
})

describe('streak', () => {
  it('starts, continues, holds within a day and resets after a gap', () => {
    expect(nextStreak({ streakDays: 0, lastActiveDate: null }, '2026-10-06')).toEqual({ streakDays: 1, lastActiveDate: '2026-10-06' })
    expect(nextStreak({ streakDays: 4, lastActiveDate: '2026-10-05' }, '2026-10-06').streakDays).toBe(5)
    expect(nextStreak({ streakDays: 4, lastActiveDate: '2026-10-06' }, '2026-10-06').streakDays).toBe(4)
    expect(nextStreak({ streakDays: 9, lastActiveDate: '2026-10-01' }, '2026-10-06').streakDays).toBe(1)
  })
})

describe('rank', () => {
  it('derives rank from the level distribution, not volume', () => {
    expect(rankFor([])).toBe('intern')
    expect(rankFor([2, 2, 2])).toBe('junior')
    expect(rankFor([3, 3, 3, 3, 3, 3])).toBe('mid')
    expect(rankFor(Array(8).fill(3).concat([4, 4, 4]))).toBe('senior')
    expect(rankFor(Array(10).fill(4))).toBe('staff')
    expect(rankFor(Array(12).fill(4).concat([5, 5, 5, 5]))).toBe('principal')
    // Many low levels never add up to a high rank.
    expect(rankFor(Array(40).fill(1))).toBe('intern')
    expect(RANK_LABELS.principal).toBe('Principal')
  })
})

describe('achievements', () => {
  const catalog = loadAcademyContent().achievements
  const base: AchievementStats = {
    attempts: 0,
    highScores: () => 0,
    placementDone: false,
    bestStreak: 0,
    levels: [],
    domainsPracticed: 0,
    reviews: 0,
    rank: 'intern',
  }

  it('awards first steps once', () => {
    expect(newlyEarned(catalog, { ...base, attempts: 1 }, new Set())).toEqual(['first-steps'])
    expect(newlyEarned(catalog, { ...base, attempts: 1 }, new Set(['first-steps']))).toEqual([])
  })

  it('checks streak, level, rank, review and placement rules', () => {
    const ids = newlyEarned(
      catalog,
      { ...base, attempts: 10, bestStreak: 7, levels: [3], reviews: 10, placementDone: true, rank: 'mid', domainsPracticed: 5, highScores: () => 5 },
      new Set(),
    )
    expect(ids).toEqual(
      expect.arrayContaining(['ten-down', 'streak-3', 'streak-7', 'competent', 'recall-10', 'placed', 'rank-junior', 'rank-mid', 'broad-base', 'sharp']),
    )
    expect(ids).not.toContain('half-century')
  })
})
