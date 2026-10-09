import { describe, expect, it } from 'vitest'
import { companyFit, COMPANY_FIT_WEIGHTS as W, type FitCompany, type FitContext } from '@/lib/company-discovery/fit'
import { PREFERRED_BOOST } from '@/lib/regions/preferred'

const CTX: FitContext = {
  targetRegions: ['gcc', 'kerala'],
  preferredRegions: [
    { id: 'ae', level: 'top' },
    { id: 'kw', level: 'top' },
    { id: 'kerala', level: 'preferred' },
  ],
  targetFamilies: ['backend', 'payments'],
  readySkills: ['php', 'laravel', 'mysql', 'typescript'],
  companyStages: ['startup', 'scaleup'],
}

const company = (over: Partial<FitCompany> = {}): FitCompany => ({
  name: 'Dinar Pay',
  regionIds: ['kuwait-city', 'kw', 'gcc'],
  industry: ['payments'],
  stage: 'startup',
  atsKind: null,
  careersUrl: null,
  evidence: {},
  ...over,
})

const labels = (f: { chips: Array<{ label: string }> }) => f.chips.map((c) => c.label)

describe('company fit (explainable chips)', () => {
  it('ranks a starred-region payments startup with PHP, open roles and a connection near the top', () => {
    const f = companyFit(
      company({ atsKind: 'lever', careersUrl: 'https://jobs.lever.co/x', evidence: { languages: ['PHP', 'TypeScript'], openRoles: 3, connections: 2 } }),
      CTX,
    )
    expect(labels(f)).toEqual([
      'Region: Kuwait',
      'Preferred: Kuwait',
      'Payments · fits Payments / Fintech Backend Engineer',
      'Tech: PHP, TypeScript',
      'Startup (your preference)',
      'Hiring: 3 open roles',
      'Warm intro: 2 connections',
      'Growth: not enough data (neutral)',
    ])
    // Unknown growth is the neutral 5 points; the total is capped at 100.
    expect(f.score).toBe(Math.min(100, W.regionIn + PREFERRED_BOOST.company.top + W.domainSpecialist + W.techTop + W.stageMatch + W.hiringOpen + W.warmIntro + 5))
  })

  it('preferred level is worth less than top priority; unstarred GCC countries get no boost', () => {
    const kochi = companyFit(company({ regionIds: ['kochi', 'kerala', 'in'] }), CTX)
    const riyadh = companyFit(company({ regionIds: ['riyadh', 'sa', 'gcc'] }), CTX)
    const dubai = companyFit(company({ regionIds: ['dubai', 'ae', 'gcc'] }), CTX)
    expect(dubai.score - riyadh.score).toBe(PREFERRED_BOOST.company.top)
    expect(kochi.score - riyadh.score).toBe(PREFERRED_BOOST.company.preferred)
    expect(labels(riyadh)).toContain('Region: Saudi Arabia')
  })

  it('outside the regions, unknown location, generic software, no tech match', () => {
    expect(labels(companyFit(company({ regionIds: ['us'] }), CTX))).toContain('Outside your regions')
    expect(labels(companyFit(company({ regionIds: [] }), CTX))).toContain('Location not known')
    const sw = companyFit(company({ industry: ['software'], evidence: { languages: ['Rust'] } }), CTX)
    expect(sw.chips.find((c) => c.kind === 'domain')).toMatchObject({ label: 'Software', points: W.domainGeneral })
    expect(sw.chips.find((c) => c.kind === 'tech')).toMatchObject({ points: 0 })
  })

  it('a job board with no openings or a careers page still signals hiring, less', () => {
    expect(companyFit(company({ atsKind: 'ashby', evidence: { openRoles: 0 } }), CTX).chips.find((c) => c.kind === 'hiring')).toMatchObject({ points: W.hiringCareers })
    expect(companyFit(company({ careersUrl: 'https://x.example/careers' }), CTX).chips.find((c) => c.kind === 'hiring')).toMatchObject({ label: 'Careers page' })
  })

  it('public sector / nationals-first is capped and flagged', () => {
    const gov = companyFit(company({ name: 'Ministry of Example Services', evidence: { openRoles: 9 } }), CTX)
    expect(gov.score).toBeLessThanOrEqual(W.governmentCap)
    expect(gov.chips[0]).toMatchObject({ kind: 'government', warn: true })
    expect(companyFit(company({ evidence: { government: true } }), CTX).score).toBeLessThanOrEqual(W.governmentCap)
  })

  it('a stage outside the preference earns nothing; no preference is neutral', () => {
    expect(companyFit(company({ stage: 'enterprise' }), CTX).chips.find((c) => c.kind === 'stage')).toMatchObject({ points: 0 })
    expect(companyFit(company({ stage: 'enterprise' }), { ...CTX, companyStages: [] }).chips.find((c) => c.kind === 'stage')).toMatchObject({ points: W.stageNeutral })
  })
})
