import { describe, it, expect } from 'vitest'
import { generateOutreachDraft } from '@/lib/documents/outreach'
import { saveMasterCV } from '@/lib/documents/master'
import { MasterCVNotFoundError, ApplicationNotFoundError } from '@/lib/documents/errors'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as documentsQ from '@/lib/db/queries/documents'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import type { MasterCV, OutreachDraft } from '@/lib/documents/types'

function makeCv(): MasterCV {
  return {
    basics: { name: 'Ada Lovelace', headline: 'Backend Engineer' },
    summary: 'Ships things.',
    experience: [
      {
        company: 'Fintech Corp',
        role: 'Staff Engineer',
        start: '2020-01',
        end: 'present',
        bullets: ['built event-sourced ledger cutting reconciliation errors 90%'],
      },
    ],
    skills: { primary: ['go', 'kafka'] },
  }
}

async function seed(email: string) {
  const u = await makeUser(email)
  const co = await makeCompany(u.id, { name: 'Stripe' })
  const j = await makeJob(u.id, co.id, { title: 'Staff Payments Engineer' })
  const app = await makeApplication(u.id, j.id)
  return { u, co, j, app }
}

describe('generateOutreachDraft', () => {
  it('persists an outreach_linkedin_connection document', async () => {
    const { u, app } = await seed('outreach-conn@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'linkedin_connection',
      tone: 'friendly',
      ai,
    })
    expect(doc.kind).toBe('outreach_linkedin_connection')
    expect(doc.version).toBe(1)
    expect(doc.title).toContain('LinkedIn Connection')
    expect(doc.title).toContain('Stripe')
    expect(doc.title).toContain('Staff Payments Engineer')
    const content = doc.content as OutreachDraft
    expect(content.kind).toBe('linkedin_connection')
    expect(content.body.length).toBeGreaterThan(0)
    expect(content.wordCount).toBeGreaterThan(0)
  })

  it('persists an outreach_linkedin_message document', async () => {
    const { u, app } = await seed('outreach-msg@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'linkedin_message',
      tone: 'formal',
      ai,
    })
    expect(doc.kind).toBe('outreach_linkedin_message')
  })

  it('persists an outreach_recruiter_reply document with a subject', async () => {
    const { u, app } = await seed('outreach-recruiter@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'recruiter_reply',
      tone: 'enthusiastic',
      ai,
    })
    expect(doc.kind).toBe('outreach_recruiter_reply')
    const content = doc.content as OutreachDraft
    expect(content.subject).toBeDefined()
  })

  it('increments version on repeat generation of the same kind', async () => {
    const { u, app } = await seed('outreach-repeat@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'linkedin_connection',
      tone: 'friendly',
      ai,
    })
    const second = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'linkedin_connection',
      tone: 'friendly',
      ai,
    })
    expect(second.version).toBe(2)
    const list = await documentsQ.list(u.id, {
      applicationId: app.id,
      kind: 'outreach_linkedin_connection',
    })
    expect(list).toHaveLength(2)
  })

  it('throws MasterCVNotFoundError when no master saved', async () => {
    const { u, app } = await seed('outreach-nomaster@x.com')
    const ai = new FixtureAIProvider()
    await expect(
      generateOutreachDraft({
        userId: u.id,
        applicationId: app.id,
        kind: 'linkedin_connection',
        tone: 'friendly',
        ai,
      }),
    ).rejects.toBeInstanceOf(MasterCVNotFoundError)
  })

  it('throws ApplicationNotFoundError for missing app', async () => {
    const u = await makeUser('outreach-noapp@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await expect(
      generateOutreachDraft({
        userId: u.id,
        applicationId: '00000000-0000-0000-0000-000000000000',
        kind: 'linkedin_message',
        tone: 'friendly',
        ai,
      }),
    ).rejects.toBeInstanceOf(ApplicationNotFoundError)
  })

  // -------------------------------------------------------------------------
  // v4.2 — follow-up email drafts
  // -------------------------------------------------------------------------

  it('persists an outreach_followup_email with daysSince from body', async () => {
    const { u, app } = await seed('outreach-followup-7@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'followup_email',
      tone: 'friendly',
      daysSince: 7,
      ai,
    })
    expect(doc.kind).toBe('outreach_followup_email')
    expect(doc.title).toContain('day 7')
    const content = doc.content as OutreachDraft
    expect(content.kind).toBe('followup_email')
    expect(content.daysSince).toBe(7)
    expect(content.subject).toBeDefined()
    expect(content.body.length).toBeGreaterThan(0)
  })

  it('computes daysSince from appliedAt when omitted', async () => {
    const u = await makeUser('outreach-followup-compute@x.com')
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, co.id, { title: 'Staff Payments Engineer' })
    // Applied 14 days ago exactly — expect the doc title to say day 14.
    const appliedAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const app = await makeApplication(u.id, j.id, { status: 'applied', appliedAt })
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'followup_email',
      tone: 'friendly',
      ai,
    })
    const content = doc.content as OutreachDraft
    expect(content.daysSince).toBe(14)
    expect(doc.title).toContain('day 14')
  })

  it('throws when kind=followup_email and appliedAt is null', async () => {
    const { u, app } = await seed('outreach-followup-noapplied@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await expect(
      generateOutreachDraft({
        userId: u.id,
        applicationId: app.id,
        kind: 'followup_email',
        tone: 'friendly',
        ai,
      }),
    ).rejects.toThrow(/applied-at/i)
  })
})
