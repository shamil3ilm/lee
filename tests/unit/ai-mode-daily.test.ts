import { describe, it, expect } from 'vitest'
import { dailyPromptSet } from '@/lib/discovery/ai-mode/daily'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import type { WatchEmployer } from '@/lib/defaults/watch-employers'

const employers: WatchEmployer[] = Array.from({ length: 20 }, (_, i) => ({
  key: `employer-${i}`,
  name: `Employer ${i}`,
  country: 'AE',
  sector: 'utilities',
  nationalsOnly: i === 0,
  careersUrl: `https://careers.employer${i}.test/`,
  backend: 'custom',
  methods: ['ai_search', 'manual'],
  sourceKey: `watch:employer-${i}`,
  note: '',
}))
const prefs: SearchPrefs = { ...EMPTY_PREFS, active: true, regions: ['AE', 'IN'], remoteScope: 'worldwide' }
const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n))

describe('dailyPromptSet', () => {
  it('shows at most the daily cap and keeps the rest under "more"', () => {
    const set = dailyPromptSet(prefs, day(0), { employers, dailyCap: 3 })
    expect(set.today).toHaveLength(3)
    expect(set.today.length + set.more.length).toBe(4 + set.employerBatches)
  })

  it('brings every family and employer batch round within the cycle', () => {
    const first = dailyPromptSet(prefs, day(0), { employers, dailyCap: 3 })
    const seen = new Set<string>()
    for (let d = 0; d < first.cycleDays; d++) dailyPromptSet(prefs, day(d), { employers, dailyCap: 3 }).today.forEach((p) => seen.add(p.id))
    expect([...seen].sort()).toEqual([...first.today, ...first.more].map((p) => p.id).sort())
    expect(seen.has('remote')).toBe(true)
    expect(seen.has('relocation')).toBe(true)
    expect(first.cycleDays).toBeLessThanOrEqual(7)
  })

  it('leaves nationals-only employers out of every prompt', () => {
    const set = dailyPromptSet(prefs, day(0), { employers, dailyCap: 50 })
    const text = set.today.map((p) => p.prompt).join('\n')
    expect(text).not.toMatch(/Employer 0\b/)
    expect(text).toMatch(/Employer 1\b/)
  })
})
