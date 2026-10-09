import { describe, expect, it } from 'vitest'
import { factLock, LIMITS, lockedDraft, templateDraft, type SpeculativeFacts } from '@/lib/company-discovery/outreach'
import { buildSpeculativeOutreachPrompt } from '@/lib/ai/prompts/speculative-outreach'
import { FixtureAIProvider } from '@/lib/ai/fixtures'

/** Synthetic candidate and company (no real person). */
const FACTS: SpeculativeFacts = {
  channel: 'email',
  company: { name: 'Dinar Pay', industries: ['payments', 'fintech'], place: 'Kuwait City, Kuwait', description: 'Payments company in Kuwait' },
  candidate: {
    name: 'Sam Example',
    headline: 'Backend developer',
    skills: ['Laravel', 'MySQL', 'REST APIs'],
    highlight: 'Built payment gateway webhooks with retries and idempotency keys',
    currentRole: 'Backend Developer at Example Fintech',
    variantName: 'Payments backend (GCC)',
  },
  contact: { kind: 'role_email', email: 'careers@dinarpay.example' },
  regionFacts: { region: 'gcc', lines: [{ label: 'Visa', value: 'Requires employment visa sponsorship for Kuwait' }, { label: 'Notice period', value: '1 month' }] },
}

describe('speculative draft (fact-locked)', () => {
  it('the template uses only the facts and passes its own lock', () => {
    const d = templateDraft(FACTS)
    expect(d.origin).toBe('template')
    expect(d.to).toBe('careers@dinarpay.example')
    expect(d.subject).toBe('Engineering roles at Dinar Pay')
    expect(d.body).toContain('Kuwait City, Kuwait')
    expect(d.body).toContain('Laravel, MySQL, REST APIs')
    expect(d.body).toContain('Requires employment visa sponsorship for Kuwait')
    expect(d.body).toContain('Built payment gateway webhooks')
    expect(factLock(`${d.subject}\n${d.body}`, FACTS)).toEqual([])
  })

  it('a LinkedIn note to a connection asks for a pointer, short enough to send', () => {
    const f: SpeculativeFacts = { ...FACTS, channel: 'linkedin', contact: { kind: 'referral', name: 'Alex Sample', position: 'Engineering Manager' } }
    const d = templateDraft(f)
    expect(d.body.startsWith('Hi Alex,')).toBe(true)
    expect(d.subject).toBeNull()
    expect(d.to).toBeNull()
    expect(d.body.length).toBeLessThanOrEqual(LIMITS.linkedin)
    expect(d.body).not.toMatch(/referred/i)
  })

  it('rejects an AI rewrite that invents numbers, skills, emails or claims', () => {
    expect(factLock('I have 7 years of experience with Kubernetes.', FACTS)).toEqual(expect.arrayContaining(['number "7"', 'skill "kubernetes"']))
    expect(factLock('Reach me at sam@personal.example', FACTS)).toEqual(['email "sam@personal.example"'])
    expect(factLock('I saw your opening for a backend role.', FACTS)).toEqual(['claim "your opening"'])
    const d = lockedDraft(FACTS, { subject: 'Hi', body: 'I cut costs by 40% using Kubernetes.' })
    expect(d.origin).toBe('template')
    expect(d.rejected?.length).toBeGreaterThan(0)
  })

  it('accepts a clean AI rewrite', () => {
    const body = 'Dear Dinar Pay hiring team,\n\nI am Sam Example, a Backend developer working with Laravel and MySQL. Could we talk about engineering roles on your payments team?\n\nThank you,\nSam Example'
    const d = lockedDraft(FACTS, { subject: 'Engineering at Dinar Pay', body })
    expect(d).toMatchObject({ origin: 'ai', body, subject: 'Engineering at Dinar Pay' })
  })

  it('the deterministic fixture provider passes the lock; the prompt carries the region block and the rules', async () => {
    const r = await new FixtureAIProvider().draftSpeculativeOutreach(FACTS)
    expect(lockedDraft(FACTS, r).origin).toBe('ai')
    const prompt = buildSpeculativeOutreachPrompt(FACTS)
    expect(prompt).toContain('Use ONLY the FACTS')
    expect(prompt).toContain('APPLICATION FACTS (GCC')
    expect(prompt).toContain('careers@dinarpay.example')
  })
})
