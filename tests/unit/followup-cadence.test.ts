import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  businessDaysBetween,
  cadenceFor,
  FOLLOWUP_CADENCE,
  isGccAgencyPosting,
  stepDue,
  stepOfDraft,
} from '@/lib/followups/cadence'
import { applySettingsFrom, applySettingsSchema, DEFAULT_APPLY_SETTINGS } from '@/lib/apply/settings'
import { buildFollowupPrompt, OUTREACH_FOLLOWUP_PROMPT_VERSION, OUTREACH_FOLLOWUP_SYSTEM } from '@/lib/ai/prompts/outreach-followup'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { makeApplication, makeMasterCV } from '@/tests/eval/factories'

// 2026-10-05 is a Monday.
const mon = new Date('2026-10-05T10:00:00Z')

describe('business days', () => {
  it('skip Saturday and Sunday', () => {
    expect(addBusinessDays(mon, 5).toISOString().slice(0, 10)).toBe('2026-10-12')
    expect(addBusinessDays(mon, 10).toISOString().slice(0, 10)).toBe('2026-10-19')
    expect(addBusinessDays(new Date('2026-10-09T10:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-12')
  })

  it('count the weekdays after the day you applied', () => {
    expect(businessDaysBetween(mon, new Date('2026-10-05T18:00:00Z'))).toBe(0)
    expect(businessDaysBetween(mon, new Date('2026-10-10T10:00:00Z'))).toBe(4)
    expect(businessDaysBetween(mon, new Date('2026-10-12T10:00:00Z'))).toBe(5)
    expect(businessDaysBetween(mon, new Date('2026-10-19T10:00:00Z'))).toBe(10)
  })
})

describe('cadence', () => {
  it('defaults: first after 5 business days, second after 10, then stop', () => {
    expect(FOLLOWUP_CADENCE).toEqual({ first: 5, second: 10, gccAgencyFirst: 3 })
    expect(DEFAULT_APPLY_SETTINGS).toMatchObject({ followupDays: 5, followupSecondDays: 10 })
    const marks = cadenceFor(DEFAULT_APPLY_SETTINGS, false)
    expect(marks).toEqual({ first: 5, second: 10 })
    expect(stepDue(4, marks)).toBeNull()
    expect(stepDue(5, marks)).toBe(1)
    expect(stepDue(9, marks)).toBe(1)
    expect(stepDue(10, marks)).toBe(2)
    expect(stepDue(40, marks)).toBe(2)
  })

  it('GCC postings through an agency get the first nudge at 3 business days', () => {
    expect(cadenceFor(DEFAULT_APPLY_SETTINGS, true)).toEqual({ first: 3, second: 10 })
    expect(isGccAgencyPosting({ title: 'PHP Developer', location: 'Dubai, UAE', companyName: 'Gulf Talent Recruitment LLC' })).toBe(true)
    expect(isGccAgencyPosting({ title: 'PHP Developer', location: 'Riyadh', companyName: 'Example Manpower Consultants' })).toBe(true)
    expect(isGccAgencyPosting({ title: 'PHP Developer', location: 'Dubai, UAE', companyName: 'Example Pay FZ-LLC' })).toBe(false)
    expect(isGccAgencyPosting({ title: 'PHP Developer', location: 'Kochi', companyName: 'Example Recruitment' })).toBe(false)
    expect(
      isGccAgencyPosting({ title: 'PHP Developer', location: 'Doha', companyName: 'Example Co', descriptionMd: 'Our client, a leading bank, is hiring.' }),
    ).toBe(true)
  })

  it('settings stay editable: the second always comes after the first', () => {
    expect(cadenceFor({ followupDays: 7, followupSecondDays: 15 }, false)).toEqual({ first: 7, second: 15 })
    expect(applySettingsSchema.safeParse({ shortlistSize: 5, followupDays: 6, followupSecondDays: 6, shortlistInEmails: true }).success).toBe(false)
    expect(applySettingsFrom({ followupDays: 7 })).toMatchObject({ followupDays: 7, followupSecondDays: 10 })
  })

  it('reads the step of stored drafts, old 7/14/21/30 ones included', () => {
    expect(stepOfDraft({ followupStep: 2, daysSince: 3 })).toBe(2)
    expect(stepOfDraft({ daysSince: 7 })).toBe(1)
    expect(stepOfDraft({ daysSince: 14 })).toBe(2)
    expect(stepOfDraft({ daysSince: 30 })).toBe(2)
    expect(stepOfDraft({})).toBeNull()
  })
})

describe('follow-up prompt 2.0.0', () => {
  it('has two steps and no article-sharing few-shot', () => {
    expect(OUTREACH_FOLLOWUP_PROMPT_VERSION).toBe('2.0.0')
    expect(OUTREACH_FOLLOWUP_SYSTEM).not.toMatch(/article|insight|value-add|14 days|21 days|30 days/i)
    expect(OUTREACH_FOLLOWUP_SYSTEM).toContain('STEP 1')
    expect(OUTREACH_FOLLOWUP_SYSTEM).toContain('STEP 2')
  })

  it('every few-shot keeps to the stated word range', () => {
    const shots = [...OUTREACH_FOLLOWUP_SYSTEM.matchAll(/"wordCount": (\d+),\s*"followupStep": (\d)/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(shots.length).toBe(2)
    for (const [words, step] of shots) {
      if (step === 1) expect(words).toBeGreaterThanOrEqual(50)
      expect(words).toBeLessThanOrEqual(110)
    }
  })

  it('carries the step and the business days into the prompt', () => {
    const p = buildFollowupPrompt({ master: makeMasterCV(), application: makeApplication(), tone: 'friendly', daysSince: 10, step: 2 })
    expect(p).toContain('--- FOLLOW-UP STEP ---\n2')
    expect(p).toContain('--- BUSINESS DAYS SINCE APPLIED ---\n10')
  })

  it('the fixture provider drafts a short note per step', async () => {
    const ai = new FixtureAIProvider()
    const app = makeApplication({ role: 'Laravel Developer', company: 'Example Gulf Co' })
    const first = await ai.draftOutreach({ master: makeMasterCV(), application: app, kind: 'followup_email', tone: 'friendly', daysSince: 5, step: 1 })
    const second = await ai.draftOutreach({ master: makeMasterCV(), application: app, kind: 'followup_email', tone: 'friendly', daysSince: 10, step: 2 })
    expect(first.followupStep).toBe(1)
    expect(second.followupStep).toBe(2)
    expect(first.body).toContain('Laravel Developer')
    expect(second.body).toMatch(/still under consideration|still open/)
    expect(`${first.body} ${second.body}`).not.toMatch(/article|write-up/i)
  })
})
