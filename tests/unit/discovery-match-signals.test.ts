import { describe, expect, it } from 'vitest'
import {
  domainComponent,
  languageComponent,
  payComponent,
  SIGNAL_LIMITS,
  visaComponent,
} from '@/lib/discovery/match/signals'
import { matchJob, matchProfile } from './discovery-match-helpers'

const GCC_FLOOR = { scope: 'GCC' as const, amount: 8000, currency: 'AED' as const, period: 'month' as const }

describe('payComponent (soft)', () => {
  it('is 0 when pay is not stated', () => {
    expect(payComponent(matchJob(), matchProfile())).toMatchObject({ points: 0, label: 'Pay: not stated' })
  })

  it('compares SAR pay with an AED floor through the peg', () => {
    const p = matchProfile({ extra: { ...matchProfile().extra, sponsorshipFor: [], payFloors: [GCC_FLOOR] } })
    const ok = payComponent(matchJob({ location: 'Jeddah', descriptionMd: 'Salary SAR 12,000 per month.' }), p)
    expect(ok).toMatchObject({ points: SIGNAL_LIMITS.pay.max, label: 'Pay: SAR 12,000/mo (≈ AED 11,752/mo), meets your range' })
    const low = payComponent(matchJob({ location: 'Riyadh', descriptionMd: 'Salary SAR 5,000 per month.' }), p)
    expect(low.points).toBe(SIGNAL_LIMITS.pay.min)
  })

  it('gives a small plus for stated pay when no floor applies', () => {
    expect(payComponent(matchJob({ salary: { min: 15000, max: 20000, currency: 'AED' } }), matchProfile()).points).toBe(2)
  })
})

describe('languageComponent', () => {
  const arabicRequired = matchJob({ location: 'Riyadh', descriptionMd: 'Fluent Arabic is required for this client-facing role.' })

  it('penalises required Arabic fluency the profile lacks and lists it as missing', () => {
    const r = languageComponent(arabicRequired, matchProfile({ languages: new Map([['arabic', 'basic']]) }))
    expect(r.component).toMatchObject({ points: SIGNAL_LIMITS.language.min, label: 'Language: Arabic required (you: basic)' })
    expect(r.missing).toEqual(['Arabic fluency (required)'])
  })

  it('rewards a language the profile speaks professionally', () => {
    const r = languageComponent(arabicRequired, matchProfile({ languages: new Map([['arabic', 'fluent']]) }))
    expect(r.component.points).toBe(SIGNAL_LIMITS.language.max)
    expect(r.missing).toEqual([])
  })

  it('treats "Arabic is a plus" as preferred, a small minus', () => {
    const r = languageComponent(matchJob({ descriptionMd: 'Arabic is a plus.' }), matchProfile())
    expect(r.component).toMatchObject({ points: -2, label: 'Language: Arabic preferred (you: none)' })
  })

  it('is 0 for English-only postings', () => {
    expect(languageComponent(matchJob({ descriptionMd: 'Excellent English required.' }), matchProfile()).component.points).toBe(0)
  })
})

describe('visaComponent (GCC sponsorship)', () => {
  it('rewards an offered visa where the user needs sponsorship', () => {
    const r = visaComponent(matchJob({ location: 'Doha, Qatar', descriptionMd: 'Employment visa provided.' }), matchProfile())
    expect(r).toMatchObject({ points: SIGNAL_LIMITS.visa.max, label: 'Visa: offered for Qatar' })
  })

  it('penalises nationals-only roles heavily', () => {
    const r = visaComponent(matchJob({ location: 'Riyadh', descriptionMd: 'This is a Saudization role for Saudi nationals only.' }), matchProfile())
    expect(r.points).toBe(SIGNAL_LIMITS.visa.min)
  })

  it('notes in-country requirements with a small minus', () => {
    const r = visaComponent(matchJob({ location: 'Dubai', descriptionMd: 'Candidates must be based in the UAE with a valid residence visa.' }), matchProfile())
    expect(r).toMatchObject({ points: -3, label: 'Visa: wants candidates already in UAE' })
  })

  it('is neutral for remote roles and where no sponsorship is needed', () => {
    expect(visaComponent(matchJob({ location: 'Remote', remoteType: 'remote' }), matchProfile()).points).toBe(0)
    const based = matchProfile({ extra: { ...matchProfile().extra, basedIn: 'AE', sponsorshipFor: ['AE'] } })
    expect(visaComponent(matchJob({ location: 'Dubai', descriptionMd: 'Visa provided.' }), based).points).toBe(0)
  })
})

describe('domainComponent', () => {
  it('adds a bonus for payments with ready payments evidence', () => {
    const r = domainComponent(matchJob({ title: 'Payments Backend Engineer', descriptionMd: 'Card issuing and wallets.' }), matchProfile())
    expect(r).toMatchObject({ points: 5, label: 'Domain: payments' })
  })

  it('stacks payments and e-invoicing / ZATCA up to the cap', () => {
    const job = matchJob({ location: 'Riyadh', descriptionMd: 'Integrate ZATCA e-invoicing (Fatoora) with our payment gateway.' })
    const r = domainComponent(job, matchProfile({ domains: new Set(['payments', 'einvoicing']) }))
    expect(r).toMatchObject({ points: SIGNAL_LIMITS.domain.max, label: 'Domain: payments + e-invoicing / ZATCA' })
  })

  it('gives nothing without ready evidence, and says so', () => {
    const r = domainComponent(matchJob({ descriptionMd: 'ZATCA Phase 2 integration.' }), matchProfile({ domains: new Set() }))
    expect(r).toMatchObject({ points: 0, label: 'Domain: e-invoicing / ZATCA (no ready evidence)' })
  })
})
