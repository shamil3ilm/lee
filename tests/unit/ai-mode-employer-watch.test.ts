import { describe, it, expect } from 'vitest'
import {
  batchEmployers,
  batchIndexesForDay,
  dayNumber,
  employerWatchPrompt,
  employerWatchPromptsForDay,
  matchWatchEmployer,
  MAX_BATCH,
  MIN_BATCH,
  planRotation,
  promptEmployers,
  watchTags,
} from '@/lib/discovery/ai-mode/employer-watch'
import type { WatchEmployer } from '@/lib/defaults/watch-employers'
import { EMPTY_PREFS } from '@/lib/discovery/relevance/prefs'

// Synthetic employers on example domains.
function employer(i: number, over: Partial<WatchEmployer> = {}): WatchEmployer {
  return {
    name: `Employer ${String(i).padStart(2, '0')}`,
    country: i % 2 === 0 ? 'AE' : 'SA',
    sector: 'government',
    nationalsOnly: false,
    careersUrl: `https://careers.employer${i}.test/jobs`,
    method: 'ai_web_search',
    alertSignupUrl: null,
    ...over,
  }
}
const many = (n: number) => Array.from({ length: n }, (_, i) => employer(i))

describe('promptEmployers', () => {
  it('uses the ai_web_search entries and leaves out nationals-only employers', () => {
    const list = [employer(1), employer(2, { nationalsOnly: true }), employer(3, { method: 'watch' })]
    expect(promptEmployers(list).map((e) => e.name)).toEqual(['Employer 01'])
  })

  it('falls back to every open entry when none is marked ai_web_search', () => {
    const list = [employer(1, { method: 'watch' }), employer(2, { method: 'source', nationalsOnly: true }), employer(3, { method: 'email_alert' })]
    expect(promptEmployers(list).map((e) => e.name)).toEqual(['Employer 01', 'Employer 03'])
  })
})

describe('batchEmployers', () => {
  it.each([5, 9, 13, 17, 24, 41, 60])('splits %i employers into even batches within the size bounds', (n) => {
    const batches = batchEmployers(many(n))
    expect(batches.flat()).toHaveLength(n)
    const sizes = batches.map((b) => b.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BATCH)
    if (n >= MIN_BATCH * 2) expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_BATCH)
  })

  it('keeps a short list in one batch and is stable', () => {
    expect(batchEmployers(many(3))).toHaveLength(1)
    expect(batchEmployers([])).toEqual([])
    expect(batchEmployers(many(20))).toEqual(batchEmployers([...many(20)].reverse()))
  })
})

describe('rotation', () => {
  it('covers every batch at least weekly within the cap', () => {
    for (const count of [1, 3, 7, 8, 14, 20, 28]) {
      const plan = planRotation(count, 4)
      expect(plan.perDay).toBeLessThanOrEqual(4)
      expect(plan.weekly).toBe(true)
      const seen = new Set<number>()
      for (let day = 1000; day < 1000 + 7; day++) {
        const today = batchIndexesForDay(count, day, plan.perDay)
        expect(today.length).toBeLessThanOrEqual(plan.perDay)
        today.forEach((i) => seen.add(i))
      }
      expect(seen.size).toBe(count)
    }
  })

  it('never exceeds the daily cap, and says when a week is not enough', () => {
    const plan = planRotation(30, 2)
    expect(plan.perDay).toBe(2)
    expect(plan.cycleDays).toBe(15)
    expect(plan.weekly).toBe(false)
    expect(planRotation(10, 0)).toEqual({ perDay: 0, cycleDays: 0, weekly: false })
    expect(batchIndexesForDay(10, 5, 0)).toEqual([])
  })

  it('uses the smallest daily count that still covers the list in a week', () => {
    expect(planRotation(6, 4).perDay).toBe(1)
    expect(planRotation(15, 4).perDay).toBe(3)
  })

  it('is deterministic per day and moves on the next day', () => {
    expect(batchIndexesForDay(6, 42, 2)).toEqual(batchIndexesForDay(6, 42, 2))
    expect(batchIndexesForDay(6, 42, 2)).not.toEqual(batchIndexesForDay(6, 43, 2))
    expect(dayNumber(new Date('1970-01-02T05:00:00Z'))).toBe(1)
  })
})

describe('employerWatchPrompt', () => {
  it('names the employers, their careers sites, expatriate roles and the wider seniority', () => {
    const batch = many(6)
    const p = employerWatchPrompt(batch, { ...EMPTY_PREFS, roleFamilies: ['backend'] })
    expect(p.prompt).toMatch(/Employer 00/)
    expect(p.prompt).toMatch(/careers\.employer0\.test/)
    expect(p.prompt).toMatch(/technology, software, data or analyst/)
    expect(p.prompt).toMatch(/expatriates/)
    expect(p.prompt).toMatch(/junior, mid-level and senior/)
    expect(p.employers).toHaveLength(6)
  })

  it("today's prompts respect the cap", () => {
    const r = employerWatchPromptsForDay(EMPTY_PREFS, new Date('2026-10-08T00:00:00Z'), { list: many(60), dailyCap: 1 })
    expect(r.prompts).toHaveLength(1)
    expect(r.plan.perDay).toBe(1)
  })
})

describe('matchWatchEmployer', () => {
  const list = [employer(1), employer(2, { name: 'Gulf Utility', careersUrl: 'https://jobs.gulfutility.co.ae/', nationalsOnly: true })]

  it('matches a link on the careers site domain', () => {
    expect(matchWatchEmployer('https://employer1.test/careers/123', '', list)?.name).toBe('Employer 01')
    expect(matchWatchEmployer('https://apply.gulfutility.co.ae/job/9', '', list)?.name).toBe('Gulf Utility')
  })

  it('matches by employer name and tags it', () => {
    const e = matchWatchEmployer('https://elsewhere.example.org/x', 'gulf utility', list)
    expect(watchTags(e)).toEqual(['employer:gulf-utility', 'nationals-only'])
    expect(watchTags(null)).toEqual([])
  })
})
