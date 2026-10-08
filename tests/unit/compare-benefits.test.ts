import { describe, expect, it } from 'vitest'
import { extractFromStructured, extractFromText, postingBenefits } from '@/lib/compare/benefits'
import { benefitChecklist, benefitsCriterion } from '@/lib/compare/checklist'
import { currentBenefitsSchema } from '@/lib/compare/types'

// Synthetic GCC postings: no real employers.
const DUBAI = `Senior Backend Engineer — Fatoora Labs (Dubai)
We build e-invoicing for the region.

What we offer:
• Tax-free salary of AED 18,000 - 22,000 per month
• Employment visa and medical insurance for you and your family
• Housing allowance and transport allowance
• Annual air ticket to your home country
• 30 days of annual leave
• End-of-service gratuity as per UAE labour law
• Learning budget for conferences and certifications`

const RIYADH = `Payments Engineer, Riyadh. Package: SAR 20,000/month. Visa + Medical + Air ticket. Performance bonus paid yearly.`

const NO_VISA = 'Backend role in Doha. Candidates must hold their own residence visa; we do not provide visa sponsorship.'

describe('extractFromText', () => {
  it('finds the GCC staples with verbatim quotes', () => {
    const b = extractFromText(DUBAI)
    expect(b.visa?.value).toBe('yes')
    expect(b.health?.value).toBe('yes')
    expect(b.family_health?.value).toBe('yes')
    expect(b.housing?.value).toBe('yes')
    expect(b.transport?.value).toBe('yes')
    expect(b.flights?.value).toBe('yes')
    expect(b.leave).toMatchObject({ value: 'yes', days: 30 })
    expect(b.gratuity?.value).toBe('yes')
    expect(b.learning?.value).toBe('yes')
    expect(b.flights?.source.quote).toBe('Annual air ticket to your home country')
    expect(DUBAI).toContain(b.housing!.source.quote!)
  })

  it('reads the "Visa + Medical + Air ticket" shorthand and a bonus', () => {
    const b = extractFromText(RIYADH)
    expect(b.visa?.value).toBe('yes')
    expect(b.flights?.value).toBe('yes')
    expect(b.bonus?.value).toBe('yes')
    expect(b.housing).toBeUndefined()
  })

  it('a refusal reads as "no", not as a visa benefit', () => {
    expect(extractFromText(NO_VISA).visa?.value).toBe('no')
  })

  it('unmentioned benefits stay unknown (absent), never "no"', () => {
    const b = extractFromText('Build APIs in Go. Hybrid.')
    expect(b.visa).toBeUndefined()
    expect(b.health).toBeUndefined()
  })
})

describe('extractFromStructured / postingBenefits', () => {
  it('reads parsed job details and labels the source', () => {
    const b = extractFromStructured({ visa_sponsorship: true, relocation_package: false, insurance: { family_covered: true }, annual_leave: 25 })
    expect(b.visa).toMatchObject({ value: 'yes', source: { kind: 'job_details' } })
    expect(b.relocation?.value).toBe('no')
    expect(b.family_health?.value).toBe('yes')
    expect(b.leave?.days).toBe(25)
  })

  it('the posting text wins over parsed details; the work mode answers WFH', () => {
    const b = postingBenefits({ text: NO_VISA, structured: { visa_sponsorship: true }, remoteType: 'onsite' })
    expect(b.visa?.value).toBe('no')
    expect(b.wfh).toMatchObject({ value: 'no', source: { kind: 'job_details' } })
  })
})

describe('benefit checklist', () => {
  const current = currentBenefitsSchema.parse({ health: 'self', bonus: false, pfGratuity: true, leaveDays: 21, wfh: true, learningBudget: null })

  it('compares row by row: better, same, worse, unknown', () => {
    const rows = benefitChecklist({ posting: postingBenefits({ text: DUBAI, remoteType: 'onsite' }), current, abroad: true })
    const by = Object.fromEntries(rows.map((r) => [r.key, r.verdict]))
    expect(by.health).toBe('same')
    expect(by.family_health).toBe('better')
    expect(by.visa).toBe('same')
    expect(by.leave).toBe('better')
    expect(by.gratuity).toBe('same')
    expect(by.wfh).toBe('worse')
    expect(by.bonus).toBe('unknown')
    expect(by.learning).toBe('unknown')
    expect(by.relocation).toBe('unknown')
  })

  it('hides visa and relocation rows for a job at home that does not mention them', () => {
    const rows = benefitChecklist({ posting: {}, current, abroad: false })
    expect(rows.map((r) => r.key)).not.toContain('visa')
  })

  it('scores only known rows; all unknown → unknown score, not zero', () => {
    const unknownRows = benefitChecklist({ posting: {}, current, abroad: false })
    expect(benefitsCriterion(unknownRows).score).toBeNull()
    const rows = benefitChecklist({ posting: postingBenefits({ text: DUBAI }), current, abroad: true })
    const result = benefitsCriterion(rows)
    expect(result.score).toBeGreaterThan(50)
    expect(result.evidence.every((e) => e.id.startsWith('benefits:'))).toBe(true)
  })
})
