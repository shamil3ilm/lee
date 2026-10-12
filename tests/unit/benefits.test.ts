import { describe, expect, it } from 'vitest'
import { extractBenefits, isEmpty } from '@/lib/benefits/extract'
import { DEFAULT_PREF_WEIGHTS, EXTRA_WEIGHTS, effectiveWeights, scoreBenefits, toLegacyBenefits } from '@/lib/benefits/score'
import { benefitsColumns, benefitsContextFor, BENEFITS_VERSION } from '@/lib/benefits/service'
import { hasBenefit } from '@/lib/discovery/scoring'
import type { UserProfile } from '@/lib/db/queries/profile'

const GULF_JD = `Backend Developer (Laravel) — Kuwait City
We offer: KWD 900 per month, housing allowance, transport allowance, annual air ticket,
family medical insurance, end-of-service gratuity as per Kuwait labour law, 30 days annual leave,
performance bonus and visa sponsorship. Children's education allowance after one year.`

describe('extractBenefits', () => {
  it('reads the Gulf staples with quotes', () => {
    const b = extractBenefits({ title: 'Backend Developer', descriptionMd: GULF_JD })
    const yes = Object.entries(b.facts).filter(([, f]) => f?.value).map(([k]) => k).sort()
    expect(yes).toEqual(
      [
        'annual_flights',
        'bonus',
        'education_allowance',
        'end_of_service',
        'family_insurance',
        'housing_allowance',
        'medical_insurance',
        'transport_allowance',
        'visa_sponsorship',
      ].sort(),
    )
    expect(b.facts.housing_allowance?.quote).toContain('housing allowance')
    expect(b.leaveDays).toBe(30)
    // KWD per month → a year.
    expect(b.salary).toMatchObject({ currency: 'KWD', period: 'month', monthly: 900, annual: 10_800 })
  })

  it('normalises monthly and annual pay across currencies', () => {
    expect(extractBenefits({ descriptionMd: 'Salary: AED 15,000 per month.' }).salary).toMatchObject({ currency: 'AED', monthly: 15_000, annual: 180_000 })
    expect(extractBenefits({ descriptionMd: 'Compensation SAR 240,000 per year.' }).salary).toMatchObject({ currency: 'SAR', period: 'year', monthly: 20_000 })
    expect(extractBenefits({ descriptionMd: 'CTC 12 LPA' }).salary).toMatchObject({ currency: 'INR', annual: 1_200_000 })
    expect(extractBenefits({ descriptionMd: 'Pay QAR 12000 monthly' }).salary).toMatchObject({ currency: 'QAR', annual: 144_000 })
    expect(extractBenefits({ descriptionMd: 'BHD 1,200 / month' }).salary).toMatchObject({ currency: 'BHD', annual: 14_400 })
    expect(extractBenefits({ descriptionMd: 'OMR 1,500 per month' }).salary).toMatchObject({ currency: 'OMR' })
    expect(extractBenefits({ descriptionMd: 'USD 90,000 a year', salary: null }).salary).toMatchObject({ currency: 'USD', annual: 90_000 })
    // Structured salary wins.
    expect(extractBenefits({ salary: { min: 8000, max: 10000, currency: 'AED' } }).salary).toMatchObject({ currency: 'AED', monthly: 10_000 })
  })

  it('records explicit "no" and never mistakes presence requirements for sponsorship', () => {
    const b = extractBenefits({ descriptionMd: 'We do not provide visa sponsorship. No relocation.' })
    expect(b.facts.visa_sponsorship?.value).toBe(false)
    expect(b.facts.relocation?.value).toBe(false)
    const uae = extractBenefits({ descriptionMd: 'Candidates must hold a valid UAE residence visa.' })
    expect(uae.facts.visa_sponsorship?.value).toBe(false)
  })

  it('remote stipend, relocation, equity and work mode', () => {
    const b = extractBenefits({
      descriptionMd: 'Remote-first. Home office stipend of $500, relocation package for Dubai, stock options.',
      remoteType: 'remote',
    })
    expect(b.facts.remote_stipend?.value).toBe(true)
    expect(b.facts.relocation?.value).toBe(true)
    expect(b.facts.equity?.value).toBe(true)
    expect(b.facts.remote_or_hybrid?.value).toBe(true)
  })

  it('a posting that states nothing is empty', () => {
    const b = extractBenefits({ title: 'Engineer', descriptionMd: 'Build things with TypeScript.' })
    expect(isEmpty(b)).toBe(true)
  })
})

describe('scoreBenefits', () => {
  it('scores against the user weights plus the extras, with an explanation', () => {
    const b = extractBenefits({ descriptionMd: GULF_JD })
    const s = scoreBenefits(b, {}, { annual: 9_000, currency: 'KWD' })
    expect(s.score).toBeGreaterThan(50)
    expect(s.score).toBeLessThanOrEqual(100)
    expect(s.explanation).toMatch(/^Stated: /)
    expect(s.explanation).toContain('Visa sponsorship +10')
    expect(s.items.find((i) => i.key === 'compensation_meets_floor')?.state).toBe('yes')
    expect(s.coverage).toBeGreaterThan(0.5)
  })

  it('unknown is NULL, never 0', () => {
    const s = scoreBenefits(extractBenefits({ descriptionMd: 'Great team.' }), {})
    expect(s.score).toBeNull()
    expect(s.coverage).toBe(0)
    expect(s.explanation).toBe('The posting states no benefits or pay.')
  })

  it('pay below the floor counts against; INR is compared with INR only', () => {
    const low = scoreBenefits(extractBenefits({ descriptionMd: 'AED 6,000 per month' }), {}, { annual: 120_000, currency: 'AED' })
    expect(low.items.find((i) => i.key === 'compensation_meets_floor')?.state).toBe('no')
    const pegged = scoreBenefits(extractBenefits({ descriptionMd: 'SAR 20,000 per month' }), {}, { annual: 150_000, currency: 'AED' })
    expect(pegged.items.find((i) => i.key === 'compensation_meets_floor')?.state).toBe('yes')
    const inr = scoreBenefits(extractBenefits({ descriptionMd: 'AED 20,000 per month' }), {}, { annual: 1_500_000, currency: 'INR' })
    expect(inr.items.find((i) => i.key === 'compensation_meets_floor')?.state).toBe('unknown')
  })

  it('user weights override; 0 removes an item', () => {
    const w = effectiveWeights({ visa_sponsorship: 0, housing_allowance: 20 })
    expect(w.visa_sponsorship).toBeUndefined()
    expect(w.housing_allowance).toBe(20)
    expect(w.annual_flights).toBe(EXTRA_WEIGHTS.annual_flights)
    expect(effectiveWeights({}).family_health_insurance).toBe(DEFAULT_PREF_WEIGHTS.family_health_insurance)
  })

  it('feeds the must-have benefit caps (hasBenefit) from the posting', () => {
    const legacy = toLegacyBenefits(extractBenefits({ descriptionMd: GULF_JD }))
    expect(hasBenefit(legacy, 'visa_sponsorship')).toBe(true)
    expect(hasBenefit(legacy, 'family_health_insurance')).toBe(true)
    expect(hasBenefit(legacy, 'compensation_meets_floor')).toBe(true)
    expect(hasBenefit(toLegacyBenefits(extractBenefits({ descriptionMd: 'Nice office.' })), 'visa_sponsorship')).toBe(false)
  })
})

describe('benefits columns and key', () => {
  const profile = (over: Partial<UserProfile> = {}) => ({ benefitPrefs: {}, compFloorAnnual: null, compCurrency: null, ...over }) as unknown as UserProfile

  it('the key changes with the version, the weights and the floor', () => {
    const k1 = benefitsContextFor(profile()).key
    expect(k1.startsWith(`${BENEFITS_VERSION}:`)).toBe(true)
    expect(benefitsContextFor(profile({ benefitPrefs: { weights: { visa_sponsorship: 1 } } })).key).not.toBe(k1)
    expect(benefitsContextFor(profile({ compFloorAnnual: 100_000, compCurrency: 'aed' })).key).not.toBe(k1)
    expect(benefitsContextFor(null).key).toBe(k1)
  })

  it('stores only stated items, small', () => {
    const c = benefitsColumns({ descriptionMd: GULF_JD }, benefitsContextFor(null))
    expect(c.benefitsDetail.items.every((i) => i.state !== 'unknown')).toBe(true)
    expect(JSON.stringify(c.benefitsDetail).length).toBeLessThan(2_000)
    expect(c.benefitsScore).not.toBeNull()
  })
})
