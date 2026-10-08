import { describe, expect, it } from 'vitest'
import type { ChecklistRow } from '@/lib/compare/checklist'
import type { PayView } from '@/lib/compare/pay'
import type { Criterion } from '@/lib/compare/types'
import { comparisonChip, gainsAndLosses, questionsToAsk, verdictLine } from '@/lib/compare/verdict'
import { rankCandidate, type RankCandidate } from '@/lib/apply/rank'

const scores = (s: Partial<Record<Criterion, number | null>>): Record<Criterion, number | null> => ({
  pay: null, benefits: null, growth: null, environment: null, stability: null, location: null, work_life: null, ...s,
})

const pay = (deltaPct: number | null, postedText: string | null = 'AED 20,000/mo'): PayView => ({
  currency: 'INR', postedText, monthly: null, annual: null, conversionLabel: null, conversionConfidence: 'unknown',
  missingFx: null, job: null, current: null, deltaPct, basis: deltaPct === null ? null : 'net',
})

const row = (key: ChecklistRow['key'], verdict: ChecklistRow['verdict'], job = verdict === 'unknown' ? 'Unknown' : 'Yes'): ChecklistRow => ({
  key, label: key, current: 'No', job, verdict, source: null,
})

describe('verdict line', () => {
  it('reads like "Likely +35% take-home, better growth, unknown benefits"', () => {
    const line = verdictLine({
      job: scores({ pay: 70, growth: 80 }),
      current: scores({ pay: 50, growth: 40, benefits: 50 }),
      pay: pay(35),
      checklist: [],
    })
    expect(line).toBe('Likely +35% take-home, better growth, unknown benefits')
  })

  it('says unknown pay when the posting states none', () => {
    expect(verdictLine({ job: scores({}), current: scores({}), pay: pay(null, null), checklist: [] })).toMatch(/^Unknown pay/)
  })
})

describe('gains, losses, unknowns and questions', () => {
  const input = {
    job: scores({ pay: 70, growth: 30, environment: null }),
    current: scores({ pay: 50, growth: 60, environment: 50 }),
    pay: pay(20),
    checklist: [row('housing', 'better'), row('wfh', 'worse', 'No'), row('visa', 'unknown'), row('bonus', 'unknown')],
  }

  it('sorts benefits and criteria into the three lists', () => {
    const l = gainsAndLosses(input)
    expect(l.gains.map((g) => g.topic)).toEqual(['pay', 'benefits'])
    expect(l.losses.map((g) => g.topic)).toEqual(['benefits', 'growth'])
    expect(l.unknowns.map((g) => g.topic)).toEqual(expect.arrayContaining(['benefits', 'environment']))
  })

  it('turns unknowns into recruiter questions without duplicating the visa one', () => {
    const q = questionsToAsk(input).map((x) => x.text)
    expect(q).toContain('Is visa sponsorship provided, and family visa sponsorship too?')
    expect(q).toContain('Is there a performance or annual bonus, and how is it decided?')
    expect(q).toContain('How would you describe the team culture, and who would I report to?')
    expect(q.some((t) => t.startsWith('Is visa sponsorship and relocation'))).toBe(false)
  })

  it('builds the compact chip', () => {
    expect(comparisonChip(input)).toBe('vs current: pay ↑ 20% est. · growth ↓ · benefits ?')
    expect(comparisonChip({ ...input, pay: pay(null) })).toContain('pay ?')
  })
})

describe('shortlist rank with the optional comparison factor', () => {
  const base: RankCandidate = {
    id: 'a', matchScore: 80, fitScore: null, regions: [], families: [], notes: {}, postedAt: null, createdAt: new Date('2026-10-08T00:00:00Z'),
    riskLevel: null, quarantined: false, filtered: false, reputation: null, feedback: [],
  }
  const ctx = { now: new Date('2026-10-08T09:00:00Z'), targetFamilies: [], targetRegions: [] }

  it('is unchanged without a delta (the default)', () => {
    const r = rankCandidate(base, ctx)
    expect(r.reasons.some((x) => x.kind === 'comparison')).toBe(false)
  })

  it('adds a capped ±8 reason when the user opted in', () => {
    const up = rankCandidate({ ...base, comparisonDelta: 60 }, ctx)
    expect(up.reasons.find((x) => x.kind === 'comparison')).toEqual({ kind: 'comparison', label: 'vs current job: +60 weighted', points: 8 })
    const down = rankCandidate({ ...base, comparisonDelta: -12 }, ctx)
    expect(down.reasons.find((x) => x.kind === 'comparison')?.points).toBe(-2)
    expect(up.score - rankCandidate(base, ctx).score).toBe(8)
  })
})
