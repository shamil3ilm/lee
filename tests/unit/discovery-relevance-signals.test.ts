import { describe, expect, it } from 'vitest'
import {
  detectContract,
  detectLanguages,
  detectNationalsOnly,
  detectPresenceRequired,
  detectPureSupport,
  detectSales,
  detectShifts,
  detectVisaOffered,
} from '@/lib/discovery/relevance/signals'
import { assessPay, convert, floorFor, parsePostedPay, USD_PEGS } from '@/lib/discovery/relevance/pay'
import { evaluateRelevance, type GateInput } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import {
  DEFAULT_RULE_MODES,
  EMPTY_DISCOVERY_PREFS,
  noticeLabel,
  parseDiscoveryPrefs,
  type DiscoveryPrefs,
} from '@/lib/discovery/relevance/discovery-prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'

const t = (title: string, description = '', employmentType?: string) => ({ title, description, employmentType })

describe('sales-heavy', () => {
  it.each([
    ['Pre-Sales Consultant', ''],
    ['Business Development Executive', ''],
    ['Software Engineer', 'You will own a sales quota and earn commission on every deal.'],
    ['Solutions Consultant', 'Meet revenue targets through cold calling and lead generation.'],
  ])('flags %s', (title, desc) => {
    expect(detectSales(t(title, desc))).not.toBeNull()
  })

  it.each([
    ['Backend Developer', 'Work closely with our business development team on integrations.'],
    ['Laravel Developer', 'Build the commission calculation engine for our agents.'],
  ])('does not flag %s on a single passing mention', (title, desc) => {
    expect(detectSales(t(title, desc))).toBeNull()
  })
})

describe('contract / freelance', () => {
  it.each([
    [t('PHP Developer (Contract)')],
    [t('Freelance Laravel Developer')],
    [t('Backend Developer', 'This is a 6-month contract with possible extension.')],
    [t('Backend Developer', 'Paid per hour, flexible schedule.')],
    [t('Backend Developer', '', 'contract')],
  ])('flags %o', (input) => {
    expect(detectContract(input)).not.toBeNull()
  })

  it.each([
    [t('Backend Developer', 'Contract-to-hire, converting to permanent after 3 months.')],
    [t('Backend Developer', 'Full-time permanent role. You will review contracts in our legal-tech product.')],
    [t('Smart Contract Developer')],
  ])('does not flag %o', (input) => {
    expect(detectContract(input)).toBeNull()
  })
})

describe('night / rotational shifts', () => {
  it.each(['Night shift allowance provided.', 'Rotational shifts including weekends.', '24x7 on-call roster.', 'Candidates must work US shift (6 PM – 3 AM IST).'])(
    'flags "%s"',
    (desc) => {
      expect(detectShifts(t('Support Engineer', desc))).not.toBeNull()
    },
  )

  it('does not flag day-time roles or "24/7 uptime" platforms', () => {
    expect(detectShifts(t('Backend Developer', 'Build systems with 99.9% uptime. Regular day hours.'))).toBeNull()
  })
})

describe('pure support (L1/L2)', () => {
  it.each(['L1 Support Engineer', 'L2 Support Analyst', 'IT Helpdesk Technician', 'Service Desk Agent'])('flags %s', (title) => {
    expect(detectPureSupport(t(title))).not.toBeNull()
  })

  it.each(['L3 Application Support Engineer', 'Production Support Engineer', 'Backend Developer'])('does not flag %s', (title) => {
    expect(detectPureSupport(t(title))).toBeNull()
  })
})

describe('work authorisation wording (GCC)', () => {
  it.each([
    'Visa will be provided.',
    'Employment visa provided along with medical insurance.',
    'Relocation package and visa sponsorship available.',
    'Open to candidates from India.',
    'We sponsor your work visa.',
  ])('reads "%s" as visa offered', (desc) => {
    expect(detectVisaOffered(desc)).not.toBeNull()
  })

  it.each([
    'Candidates must be based in the UAE.',
    'Must be currently residing in Dubai.',
    'UAE residence visa required.',
    'Transferable visa preferred.',
    'Candidates on own visa can apply.',
    'Local candidates only.',
    'Visit visa holders may apply.',
  ])('reads "%s" as presence required (info only)', (desc) => {
    expect(detectPresenceRequired(desc)).toBe(true)
    expect(detectNationalsOnly(desc)).toBeNull()
  })

  it.each(['UAE Nationals only.', 'This is an Emiratisation role.', 'Saudi nationals only (Saudization).', 'Open to Qatari nationals.'])(
    'reads "%s" as nationals only',
    (desc) => {
      expect(detectNationalsOnly(desc)).not.toBeNull()
    },
  )

  it('reads neither in a plain description', () => {
    expect(detectVisaOffered('Build Laravel APIs for our fintech platform.')).toBeNull()
    expect(detectPresenceRequired('Build Laravel APIs for our fintech platform.')).toBe(false)
  })
})

describe('languages', () => {
  it.each([
    ['Fluent Arabic is required.', true],
    ['Arabic speaker required.', true],
    ['Native Arabic and English.', true],
    ['Bilingual in English and Arabic.', true],
    ['Arabic is a plus.', false],
    ['Arabic preferred.', false],
    ['Knowledge of Arabic is an advantage.', false],
  ])('%s → required=%s', (desc, required) => {
    expect(detectLanguages(t('Backend Developer', desc))).toContainEqual({ language: 'arabic', required })
  })

  it('finds no language in an unrelated description', () => {
    expect(detectLanguages(t('Backend Developer', 'PHP, Laravel, MySQL.'))).toEqual([])
  })
})

describe('pay parsing and pegged conversion', () => {
  it.each([
    ['Salary: AED 8,000 - 12,000 per month', { min: 8000, max: 12000, currency: 'AED', period: 'month' }],
    ['SAR 10,000/month + housing', { min: 10000, max: 10000, currency: 'SAR', period: 'month' }],
    ['CTC: 6-9 LPA', { min: 600000, max: 900000, currency: 'INR', period: 'year' }],
    ['Package 12 lakhs per annum', { min: 1200000, max: 1200000, currency: 'INR', period: 'year' }],
    ['Pay: 15,000 QAR monthly', { min: 15000, max: 15000, currency: 'QAR', period: 'month' }],
    ['USD 60k - 80k a year', { min: 60000, max: 80000, currency: 'USD', period: 'year' }],
  ])('%s', (description, expected) => {
    expect(parsePostedPay({ description })).toEqual(expected)
  })

  it('prefers the structured salary', () => {
    expect(parsePostedPay({ salary: { min: 5000, max: 7000, currency: 'AED' }, description: 'INR 10 LPA' })).toMatchObject({ currency: 'AED', period: 'month' })
  })

  it('returns null when no pay is stated', () => {
    expect(parsePostedPay({ description: 'Competitive salary and benefits. 5+ years of experience.' })).toBeNull()
  })

  it('converts GCC currencies through the documented USD pegs', () => {
    expect(USD_PEGS.AED).toBe(3.6725)
    expect(convert(3.75, 'SAR', 'AED')).toBeCloseTo(3.6725, 6)
    expect(convert(1, 'BHD', 'AED')).toBeCloseTo(3.6725 / 0.376, 6)
    expect(convert(1_000, 'INR', 'AED')).toBeNull()
  })

  const gccFloor = { scope: 'GCC' as const, amount: 10_000, currency: 'AED' as const, period: 'month' as const }
  const inFloor = { scope: 'IN' as const, amount: 800_000, currency: 'INR' as const, period: 'year' as const }

  it('picks the floor by region', () => {
    expect(floorFor([gccFloor, inFloor], new Set(['SA']))).toBe(gccFloor)
    expect(floorFor([gccFloor, inFloor], new Set(['IN']))).toBe(inFloor)
    expect(floorFor([gccFloor, inFloor], new Set())).toBeNull()
  })

  it('compares in the posting currency and shows the AED equivalent', () => {
    const sar = assessPay({ min: 7_000, max: 8_000, currency: 'SAR', period: 'month' }, gccFloor)
    expect(sar.below).toBe(true)
    expect(sar.figure).toBe('SAR 7,000–8,000/mo (≈ AED 7,835/mo)')
    const ok = assessPay({ min: 11_000, max: 11_000, currency: 'SAR', period: 'month' }, gccFloor)
    expect(ok.below).toBe(false)
    const lpa = assessPay({ min: 500_000, max: 600_000, currency: 'INR', period: 'year' }, inFloor)
    expect(lpa).toEqual({ figure: '₹5–6 LPA', below: true })
  })
})

describe('discovery prefs parsing', () => {
  it('falls back to defaults on junk and keeps valid parts', () => {
    const p = parseDiscoveryPrefs({ rules: { sales: 'soft', bogus: 'hard', shifts: 'nope' }, basedIn: 'IN', languages: [{ name: 'Arabic', level: 'basic' }, { name: '', level: 'x' }] })
    expect(p.rules).toEqual({ sales: 'soft' })
    expect(p.basedIn).toBe('IN')
    expect(p.languages).toEqual(EMPTY_DISCOVERY_PREFS.languages)
    expect(parseDiscoveryPrefs('garbage')).toEqual(EMPTY_DISCOVERY_PREFS)
  })

  it('defaults sales and contract to hard, shifts and support to soft', () => {
    expect(DEFAULT_RULE_MODES).toMatchObject({ sales: 'hard', contract: 'hard', shifts: 'soft', support: 'soft' })
  })

  it('labels notice-period choices', () => {
    expect(noticeLabel(['1_month', 'immediate'])).toBe('Immediate or 1 month')
    expect(noticeLabel([])).toBeNull()
  })
})

describe('soft rules in the gate', () => {
  const extra: DiscoveryPrefs = {
    ...EMPTY_DISCOVERY_PREFS,
    basedIn: 'IN',
    sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
    payFloors: [{ scope: 'GCC', amount: 10_000, currency: 'AED', period: 'month' }],
    languages: [
      { name: 'English', level: 'professional' },
      { name: 'Arabic', level: 'basic' },
      { name: 'Malayalam', level: 'fluent' },
    ],
  }
  const prefs: SearchPrefs = {
    ...EMPTY_PREFS,
    active: true,
    roleFamilies: ['backend', 'fullstack'],
    seniority: ['junior', 'mid'],
    regions: [...REGION_CODES],
    extra,
  }
  const job = (title: string, descriptionMd: string, location = 'Dubai'): GateInput => ({ title, location, remoteType: 'onsite', descriptionMd })

  it('hard-filters sales and contract roles by default, with reasons', () => {
    expect(evaluateRelevance(job('Backend Developer (Contract)', ''), prefs).reasons).toEqual(['contract / freelance (contract)'])
    expect(evaluateRelevance(job('Backend Developer', 'Own a quota and earn commission.'), prefs).reasons[0]).toMatch(/^sales-heavy/)
  })

  it('keeps shift and L2 support roles but ranks them lower', () => {
    const r = evaluateRelevance(job('Backend Developer', 'Rotational shifts, 24x7 support.'), prefs)
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual(['rotational shifts'])
    expect(r.rankAdjust).toBeLessThan(0)
  })

  it('lets the user flip a rule', () => {
    const soft = { ...prefs, extra: { ...extra, rules: { contract: 'soft' as const, shifts: 'hard' as const } } }
    expect(evaluateRelevance(job('Backend Developer (Contract)', ''), soft)).toMatchObject({ pass: true, penalties: ['contract / freelance (contract)'] })
    expect(evaluateRelevance(job('Backend Developer', 'Night shift'), soft).pass).toBe(false)
    const off = { ...prefs, extra: { ...extra, rules: { contract: 'off' as const } } }
    expect(evaluateRelevance(job('Backend Developer (Contract)', ''), off)).toMatchObject({ pass: true, penalties: [] })
  })

  it('boosts GCC postings that offer a visa and only notes "must be in UAE"', () => {
    const visa = evaluateRelevance(job('Laravel Developer', 'Visa and flights provided.'), prefs)
    expect(visa.boosts).toContain('visa / relocation offered')
    expect(visa.rankAdjust).toBeGreaterThan(0)
    const presence = evaluateRelevance(job('Laravel Developer', 'Candidates must be based in the UAE. Own visa preferred.'), prefs)
    expect(presence).toMatchObject({ pass: true, penalties: [], rankAdjust: 0 })
    expect(presence.infos).toContain('Needs presence in UAE — visit visa possible')
  })

  it('treats nationals-only roles as a soft mismatch', () => {
    const r = evaluateRelevance(job('Laravel Developer', 'UAE Nationals only.'), prefs)
    expect(r).toMatchObject({ pass: true, penalties: ['visa: nationals only'] })
  })

  it('handles required and preferred languages', () => {
    expect(evaluateRelevance(job('Laravel Developer', 'Fluent Arabic required.'), prefs).penalties).toEqual([
      'language: Arabic required (you: basic)',
    ])
    expect(evaluateRelevance(job('Laravel Developer', 'Arabic is a plus.'), prefs).penalties).toEqual([])
    expect(evaluateRelevance(job('Laravel Developer', 'Malayalam speakers welcome.', 'Kochi'), prefs).boosts).toEqual(['language: Malayalam'])
  })

  it('never filters on pay: below the range ranks lower with a chip', () => {
    const r = evaluateRelevance(job('Laravel Developer', 'Salary SAR 6,000 per month', 'Riyadh'), prefs)
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual(['pay: SAR 6,000/mo (≈ AED 5,876/mo), below your range'])
    const ok = evaluateRelevance(job('Laravel Developer', 'Salary AED 12,000 per month'), prefs)
    expect(ok.infos).toContain('pay: AED 12,000/mo')
  })

  it('marks DevOps-heavy backend postings as weaker for a profile without infra experience', () => {
    const d = 'Docker, Kubernetes, Terraform, AWS, Helm and CI/CD pipelines are the core of this role.'
    expect(evaluateRelevance(job('Backend Developer', d), prefs).penalties[0]).toMatch(/^DevOps-heavy/)
    expect(evaluateRelevance(job('Backend Developer', d), { ...prefs, infraExperience: true }).penalties).toEqual([])
  })
})
