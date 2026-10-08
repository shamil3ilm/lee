import { describe, expect, it } from 'vitest'
import { compareOpportunity } from '@/lib/compare/compare'
import type { OpportunityInput, ProfileContext } from '@/lib/compare/inputs'
import { parseOpportunityKeys, placeOf } from '@/lib/compare/inputs'
import { rankByTotal, weightedTotal } from '@/lib/compare/score'
import { assumptionsSchema, currentJobSchema, defaultWeights, type Criterion } from '@/lib/compare/types'

const NOW = new Date('2026-10-08T09:00:00Z')

const DESCRIPTION = `We are hiring a Senior Backend Engineer in Dubai to build our e-invoicing platform (ZATCA, Fatoora).
Salary: AED 18,000 - 22,000 per month.
Benefits: employment visa, medical insurance, annual air ticket, 30 days annual leave.
You will get mentorship from our staff engineers.`

function job(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    key: 'd:00000000-0000-4000-8000-000000000001',
    kind: 'discovery',
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Senior Backend Engineer',
    companyName: 'Fatoora Labs',
    location: 'Dubai, UAE',
    remoteType: 'onsite',
    employmentType: 'fulltime',
    description: DESCRIPTION,
    salary: null,
    structuredBenefits: {},
    techStack: ['Go', 'PostgreSQL', 'Kafka'],
    url: 'https://fatoora-labs.example/jobs/1',
    href: '/discoveries/00000000-0000-4000-8000-000000000001',
    reputation: null,
    ...overrides,
  }
}

const profile: ProfileContext = {
  skills: ['Go', 'PostgreSQL', 'Laravel'],
  studyLabels: ['Kafka'],
  domainText: 'Built ZATCA e-invoicing integrations and payment gateways.',
}

const current = currentJobSchema.parse({
  employer: 'Synthetic Corp',
  title: 'Software Engineer',
  place: 'IN',
  workMode: 'hybrid',
  monthlyGross: 150_000,
  currency: 'INR',
  benefits: { health: 'self', leaveDays: 21, wfh: true },
  ratings: { growth: 2, techStack: 3, manager: 3, workLife: 4, security: 4, culture: 3 },
  wantMore: ['growth', 'pay'],
})

const assumptions = assumptionsSchema.parse({
  fx: { rates: { INR: 83 }, updatedAt: '2026-10-01' },
  places: { IN: { taxRate: 15 } },
})

describe('compareOpportunity: pay', () => {
  it('converts the posted AED range to INR monthly and annual, and estimates take-home', () => {
    const c = compareOpportunity({ job: job(), current, assumptions, profile, now: NOW })
    expect(c.pay.postedText).toBe('AED 18,000/mo – AED 22,000/mo')
    expect(c.pay.monthly?.min).toBeCloseTo((18_000 / 3.6725) * 83, 4)
    expect(c.pay.annual?.max).toBeCloseTo(((22_000 / 3.6725) * 83) * 12, 4)
    expect(c.pay.basis).toBe('net')
    const mid = ((20_000 / 3.6725) * 83)
    expect(c.pay.deltaPct).toBe(Math.round((mid / (150_000 * 0.85) - 1) * 100))
    expect(c.job.criteria.pay.confidence).toBe('estimated')
    expect(c.verdict).toMatch(/^Likely \+\d+% take-home/)
  })

  it('unknown pay stays unknown and becomes a question', () => {
    const c = compareOpportunity({
      job: job({ description: 'Senior Backend Engineer in Dubai. Visa provided.' }),
      current,
      assumptions,
      profile,
      now: NOW,
    })
    expect(c.job.scores.pay).toBeNull()
    expect(c.pay.postedText).toBeNull()
    expect(c.questions.map((q) => q.topic)).toContain('pay')
    expect(c.chip).toContain('pay ?')
  })

  it('a missing FX rate is reported, not guessed', () => {
    const c = compareOpportunity({ job: job(), current, assumptions: assumptionsSchema.parse({}), profile, now: NOW })
    expect(c.pay.missingFx).toBe('INR')
    expect(c.job.scores.pay).toBeNull()
  })
})

describe('compareOpportunity: growth, location, benefits', () => {
  it('growth lists level, new skills, study list, domain fit and mentoring', () => {
    const c = compareOpportunity({ job: job(), current, assumptions, profile, now: NOW })
    const texts = c.job.criteria.growth.evidence.map((e) => e.text)
    expect(texts).toContain('Step up: Senior vs your Mid-level (a title without a level reads as Mid-level)')
    expect(texts.some((t) => t.startsWith('New to learn: Kafka'))).toBe(true)
    expect(texts).toContain('On your study list: Kafka')
    expect(texts).toContain('Domain fit: e-invoicing, which you have done')
    expect(texts).toContain('Mentoring or a career path mentioned')
    expect(c.job.scores.growth).toBeGreaterThan(c.current!.scores.growth!)
    expect(c.stack).toEqual({ overlap: ['Go', 'PostgreSQL'], novel: ['Kafka'], onStudyList: ['Kafka'] })
  })

  it('abroad with visa stated scores location; benefits compare against the current job', () => {
    const c = compareOpportunity({ job: job(), current, assumptions, profile, now: NOW })
    expect(c.place).toEqual({ job: 'AE', remote: false, abroad: true })
    expect(c.job.scores.location).toBeGreaterThan(50)
    const leave = c.checklist.find((r) => r.key === 'leave')
    expect(leave).toMatchObject({ verdict: 'better', job: '30 days', current: '21 days' })
  })
})

describe('compareOpportunity: environment and stability from confirmed reputation', () => {
  it('uses the user’s ratings and confirmed red flags; unconfirmed news is listed only', () => {
    const c = compareOpportunity({
      job: job({
        reputation: {
          companyId: '11111111-1111-4111-8111-111111111111',
          ratings: [{ site: 'glassdoor', rating: 4, summary: 'Good team', url: null, recordedAt: '2026-09-01T00:00:00Z' }],
          summary: {
            pros: [],
            cons: [],
            redFlags: [{ category: 'layoffs', text: 'Layoffs reported in 2026', cites: ['x'], gccRelevance: '' }],
            gccNote: '',
            confirmedAt: '2026-09-02T00:00:00Z',
          },
          facts: null,
          signals: [
            { id: 's1', source: 'gdelt', kind: 'news', title: 'Fatoora Labs accused of salary delays', url: 'https://news.example/a', date: '2026-08-01', category: 'wage_theft', value: null },
          ],
        },
      }),
      current,
      assumptions,
      profile,
      now: NOW,
    })
    expect(c.job.scores.environment).toBe(75)
    expect(c.job.scores.stability).toBe(35)
    expect(c.redFlags).toEqual([
      expect.objectContaining({ confirmed: true, text: 'Layoffs: Layoffs reported in 2026' }),
      expect.objectContaining({ confirmed: false, text: 'Fatoora Labs accused of salary delays' }),
    ])
    expect(c.reviews.average).toBe(4)
    expect(c.reviews.links.map((l) => l.id)).toContain('glassdoor')
  })

  it('without reputation data environment and stability are unknown (questions, not zeros)', () => {
    const c = compareOpportunity({ job: job(), current, assumptions, profile, now: NOW })
    expect(c.job.scores.environment).toBeNull()
    expect(c.job.scores.stability).toBeNull()
    expect(c.questions.map((q) => q.topic)).toEqual(expect.arrayContaining(['environment', 'stability']))
    expect(c.unknowns.some((u) => u.topic === 'environment')).toBe(true)
  })
})

describe('weighted total', () => {
  const weights = defaultWeights([])
  const scores = (s: Partial<Record<Criterion, number | null>>): Record<Criterion, number | null> => ({
    pay: null, benefits: null, growth: null, environment: null, stability: null, location: null, work_life: null, ...s,
  })

  it('leaves unknowns out instead of counting them as zero', () => {
    expect(weightedTotal(scores({ pay: 80, growth: 60 }), weights)).toEqual({ score: 70, coverage: 0.29 })
    expect(weightedTotal(scores({}), weights)).toEqual({ score: null, coverage: 0 })
  })

  it('applies the "what I want more of" weights', () => {
    const w = defaultWeights(['growth'])
    expect(w.growth).toBe(2)
    expect(weightedTotal(scores({ pay: 40, growth: 100 }), w).score).toBe(80)
  })

  it('ranks by total, unknown totals last', () => {
    const ranked = rankByTotal(
      [
        { key: 'a', scores: scores({ pay: 40 }) },
        { key: 'b', scores: scores({}) },
        { key: 'c', scores: scores({ pay: 90 }) },
      ],
      weights,
    )
    expect(ranked.map((r) => r.key)).toEqual(['c', 'a', 'b'])
  })
})

describe('keys and places', () => {
  it('parses at most three distinct opportunity keys', () => {
    const a = '00000000-0000-4000-8000-00000000000a'
    expect(parseOpportunityKeys(`d:${a},a:${a},d:${a},bogus,d:x`)).toEqual([`d:${a}`, `a:${a}`])
  })

  it('places a remote job where the user is', () => {
    expect(placeOf('Remote', 'remote', 'IN')).toEqual({ place: 'IN', remote: true })
    expect(placeOf('Riyadh, Saudi Arabia', 'onsite', 'IN')).toEqual({ place: 'SA', remote: false })
    expect(placeOf('London, UK', 'onsite', 'IN')).toEqual({ place: 'OTHER', remote: false })
  })
})
