import { describe, it, expect } from 'vitest'
import { applyCaps, benefitsScore, hasBenefit } from '@/lib/discovery/scoring'
import type { JobMatchResult } from '@/lib/ai/types'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import type { UserProfile } from '@/lib/db/queries/profile'

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    userId: 'u1',
    headline: null,
    summaryMd: null,
    careerNarrativeMd: null,
    skills: [],
    industries: [],
    roleTypes: [],
    seniority: null,
    yearsExperience: null,
    employmentTypes: [],
    remotePref: 'any',
    locationPrefs: [],
    acceptRelocation: false,
    willingToRelocateTo: [],
    compFloorAnnual: null,
    compCurrency: null,
    stackWeights: {},
    companySizeWeights: {},
    benefitPrefs: {},
    mustHaves: [],
    dealbreakers: [],
    keywords: [],
    updatedAt: new Date(),
    ...overrides,
  } as UserProfile
}

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    kind: 'job',
    title: 'Senior Backend Engineer',
    companyName: 'Acme',
    applyUrl: 'https://acme.com/jobs/1',
    descriptionMd: '',
    techStack: [],
    remoteType: 'onsite',
    ...overrides,
    raw: {},
  }
}

function makeMatch(overrides: Partial<JobMatchResult> = {}): JobMatchResult {
  return {
    match_score: 80,
    strengths: [],
    red_flags: [],
    reasoning: '',
    location_match: 'priority_1',
    seniority_match: 'match',
    stack_overlap: [],
    stack_gaps: [],
    industry_match: 'strong',
    ...overrides,
  }
}

describe('applyCaps', () => {
  it('caps at 30 when location mismatch, not remote, and user will not relocate', () => {
    const p = makeProfile({ acceptRelocation: false })
    const j = makeJob({ remoteType: 'onsite' })
    const m = makeMatch({ match_score: 90, location_match: 'mismatch' })
    expect(applyCaps(m, j, p)).toBe(30)
  })

  it('does NOT cap for location when remote', () => {
    const p = makeProfile({ acceptRelocation: false })
    const j = makeJob({ remoteType: 'remote' })
    const m = makeMatch({ match_score: 90, location_match: 'mismatch' })
    expect(applyCaps(m, j, p)).toBe(90)
  })

  it('does NOT cap for location if user is open to relocation', () => {
    const p = makeProfile({ acceptRelocation: true })
    const j = makeJob({ remoteType: 'onsite' })
    const m = makeMatch({ match_score: 90, location_match: 'mismatch' })
    expect(applyCaps(m, j, p)).toBe(90)
  })

  it('caps at 40 on stretch_down seniority', () => {
    const p = makeProfile()
    const j = makeJob()
    const m = makeMatch({ match_score: 95, seniority_match: 'stretch_down' })
    expect(applyCaps(m, j, p)).toBe(40)
  })

  it('caps at 25 when must-have benefit is missing', () => {
    const p = makeProfile({
      benefitPrefs: { must_haves: ['visa_sponsorship'] } as never,
    })
    const j = makeJob() as unknown as NormalizedJob & { benefits: Record<string, unknown> }
    j.benefits = {}
    const m = makeMatch({ match_score: 80 })
    expect(applyCaps(m, j, p)).toBe(25)
  })

  it('does NOT cap when must-have benefit is present', () => {
    const p = makeProfile({
      benefitPrefs: { must_haves: ['visa_sponsorship'] } as never,
    })
    const j = makeJob() as unknown as NormalizedJob & { benefits: Record<string, unknown> }
    j.benefits = { visa_sponsorship: true }
    const m = makeMatch({ match_score: 80 })
    expect(applyCaps(m, j, p)).toBe(80)
  })
})

describe('benefitsScore', () => {
  it('returns 0 when no weights configured', () => {
    expect(benefitsScore({}, {})).toBe(0)
  })

  it('scales matched weights to 0..100', () => {
    const benefits = { visa_sponsorship: true, four_day_week: true }
    const weights = { visa_sponsorship: 3, four_day_week: 1, equity: 2 }
    // Earned = 3 + 1 = 4; total = 6; 4/6 = 66.67 → 67
    expect(benefitsScore(benefits, weights)).toBe(67)
  })

  it('returns 0 when total weight is 0', () => {
    expect(benefitsScore({}, { visa_sponsorship: 0 })).toBe(0)
  })
})

describe('hasBenefit', () => {
  it('checks nested insurance.family_covered', () => {
    expect(hasBenefit({ insurance: { family_covered: true } }, 'family_health_insurance')).toBe(
      true,
    )
    expect(hasBenefit({ insurance: {} }, 'family_health_insurance')).toBe(false)
  })

  it('checks remote/hybrid flags', () => {
    expect(hasBenefit({ remote: { fully_remote: true } }, 'remote_or_hybrid')).toBe(true)
    expect(hasBenefit({ remote: { hybrid: true } }, 'remote_or_hybrid')).toBe(true)
    expect(hasBenefit({ remote: {} }, 'remote_or_hybrid')).toBe(false)
  })

  it('falls back to literal boolean for unknown keys', () => {
    expect(hasBenefit({ some_custom_perk: true }, 'some_custom_perk')).toBe(true)
    expect(hasBenefit({ some_custom_perk: false }, 'some_custom_perk')).toBe(false)
  })
})
