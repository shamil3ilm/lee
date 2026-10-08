import { describe, expect, it } from 'vitest'
import { fromForm, parseAmount, toForm } from '@/lib/compare/form'
import { figuresGrounded, sanitizeNarrative } from '@/lib/compare/narrative'
import { buildDocument } from '@/lib/portfolio/publish'
import { parseResumeProfile } from '@/lib/resume/types'
import { currentJobSchema } from '@/lib/compare/types'

const NOW = new Date('2026-10-08T09:00:00Z')

describe('portfolio mapping never includes the current job', () => {
  it('drops a current job smuggled into the résumé object', () => {
    const profile = parseResumeProfile({
      basics: { name: 'Test Person' },
      work: [{ id: 'w1', name: 'Public Synthetic Co', position: 'Engineer', startDate: '2022' }],
      currentJob: { employer: 'Hidden Synthetic Co', monthlyGross: 123_456 },
      current_job: { employer: 'Hidden Synthetic Co' },
    })
    const json = JSON.stringify(buildDocument(profile, null, NOW))
    expect(json).toContain('Public Synthetic Co')
    expect(json).not.toContain('Hidden Synthetic Co')
    expect(json).not.toContain('123456')
    expect(json).not.toMatch(/current_?job/i)
  })
})

describe('current-job form', () => {
  it('round-trips through the schema; empty means not set, never zero', () => {
    const form = toForm(null, { employer: 'Synthetic Co', title: 'Engineer' })
    expect(form.employer).toBe('Synthetic Co')
    const parsed = currentJobSchema.parse(fromForm({ ...form, monthlyGross: '1,85,000', leaveDays: '', bonus: 'yes' }))
    expect(parsed.monthlyGross).toBe(185_000)
    expect(parsed.benefits.leaveDays).toBeNull()
    expect(parsed.benefits.bonus).toBe(true)
    expect(parsed.benefits.wfh).toBeNull()
    expect(toForm(parsed).monthlyGross).toBe('185000')
  })

  it('parses amounts strictly', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('12 000')).toBe(12_000)
    expect(Number.isNaN(parseAmount('12k'))).toBe(true)
  })
})

describe('narrative grounding', () => {
  it('keeps a figure only when a cited fact contains it', () => {
    expect(figuresGrounded('Pay is AED 20,000 a month', ['Pay: AED 20,000/mo'])).toBe(true)
    expect(figuresGrounded('About 35% more', ['Pay: +34% take-home'])).toBe(false)
    expect(figuresGrounded('No numbers here', [])).toBe(true)
    expect(figuresGrounded('About 5 more', ['Pay: 15 or 50'])).toBe(false)
  })

  it('drops claims citing unknown ids and caps the lists', () => {
    const input = { jobTitle: 'Engineer', companyName: null, facts: [{ id: 'pay:1', text: 'Pay: AED 20,000/mo' }], unknowns: [{ id: 'q-visa', text: 'Visa?' }] }
    const out = sanitizeNarrative(
      {
        summary: [
          { text: 'Pay is AED 20,000.', cites: ['pay:1', 'ghost'] },
          { text: 'Invented.', cites: ['ghost'] },
          ...Array.from({ length: 8 }, () => ({ text: 'Stated pay.', cites: ['pay:1'] })),
        ],
        questions: [{ text: 'Ask about the visa.', cites: ['q-visa'] }],
      },
      input,
    )
    expect(out.summary[0]).toEqual({ text: 'Pay is AED 20,000.', cites: ['pay:1'] })
    expect(out.summary).toHaveLength(5)
    expect(out.questions).toEqual([{ text: 'Ask about the visa.', cites: ['q-visa'] }])
  })
})
