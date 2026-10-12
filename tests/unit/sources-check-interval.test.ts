import { describe, expect, it } from 'vitest'
import { capacityNote, checkInterval } from '@/lib/sources/check-interval'
import { DEFAULT_JOB_COST_MS, TIER_WEIGHT, activeShareMs, dailyWorkPoolMs, userPollBudgetMs } from '@/lib/queue/capacity'
import { JOB_TYPES } from '@/lib/queue/job-types'

const POLL = DEFAULT_JOB_COST_MS[JOB_TYPES.discoverySource]!

describe('checkInterval', () => {
  it('is daily while the polls fit the budget', () => {
    expect(checkInterval([10_000, 10_000], 60_000)).toEqual({ sources: 2, everyDays: 1 })
    expect(checkInterval([60_000], 60_000)).toEqual({ sources: 1, everyDays: 1 })
  })

  it('rounds up the days it takes the budget to pay for every poll', () => {
    expect(checkInterval([30_000, 30_000, 1], 60_000)).toEqual({ sources: 3, everyDays: 2 })
    // 150 sources at the default poll cost on a 300 s daily budget: 1,500 s → 5 days.
    expect(checkInterval(Array.from({ length: 150 }, () => POLL), 300_000)).toEqual({ sources: 150, everyDays: 5 })
  })

  it('has no interval without sources, and survives a zero budget', () => {
    expect(checkInterval([], 60_000)).toEqual({ sources: 0, everyDays: 0 })
    expect(checkInterval([POLL], 0).everyDays).toBe(POLL)
  })
})

describe('capacityNote', () => {
  it('says how often each source is checked', () => {
    expect(capacityNote({ sources: 40, everyDays: 1 })).toBe(
      'lee checks the stalest sources first each day; with 40 sources on, each is checked about every day.',
    )
    expect(capacityNote({ sources: 150, everyDays: 5 })).toBe(
      'lee checks the stalest sources first each day; with 150 sources on, each is checked about every 5 days.',
    )
    expect(capacityNote({ sources: 1, everyDays: 1 })).toContain('with 1 source on')
    expect(capacityNote({ sources: 0, everyDays: 0 })).toBeNull()
  })
})

describe('the per-user poll budget', () => {
  it('is an active user’s weighted share of the daily pool, less their fixed jobs', () => {
    const pool = dailyWorkPoolMs()
    // Alone: the whole pool.
    expect(activeShareMs(TIER_WEIGHT.active)).toBe(pool)
    // With 9 idle users (weight 1 each) the active user gets 3 / 12.
    expect(activeShareMs(TIER_WEIGHT.active + 9)).toBeCloseTo(pool / 4)
    expect(userPollBudgetMs(TIER_WEIGHT.active + 9, 5_000)).toBe(Math.floor(pool / 4 - 5_000))
    expect(userPollBudgetMs(TIER_WEIGHT.active, pool * 2)).toBe(0)
  })

  it('at 100 active invitees, 150 default-cost sources are not checked daily', () => {
    const budget = userPollBudgetMs(100 * TIER_WEIGHT.active, 5_000)
    expect(checkInterval(Array.from({ length: 150 }, () => POLL), budget).everyDays).toBe(Math.ceil((150 * POLL) / budget))
    expect(checkInterval(Array.from({ length: 150 }, () => POLL), budget).everyDays).toBeGreaterThan(1)
  })
})
