import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, interviewStages, jobs } from '@/lib/db/schema'
import { checkDocumentStaleness } from '@/lib/staleness/check'
import * as activitiesQ from '@/lib/db/queries/activities'
import * as documentsQ from '@/lib/db/queries/documents'
import * as stagesQ from '@/lib/db/queries/stages'
import { saveMasterCV } from '@/lib/documents/master'
import { generateTailoredCV } from '@/lib/documents/tailor'
import { generateCoverLetter } from '@/lib/documents/coverLetter'
import { generateOutreachDraft } from '@/lib/documents/outreach'
import { generateInterviewPrepPack } from '@/lib/documents/prep'
import {
  generateAIDebrief,
  saveQuickDebrief,
} from '@/lib/documents/debrief'
import { snapshotForMerged } from '@/lib/staleness/snapshot'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import type { MasterCV } from '@/lib/documents/types'

// Auth mock: only the route test needs it. checkDocumentStaleness itself
// takes the userId directly.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

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
        bullets: ['built event-sourced ledger'],
      },
    ],
    skills: { primary: ['go', 'kafka'] },
  }
}

async function seed(email: string) {
  const u = await makeUser(email)
  const co = await makeCompany(u.id, { name: 'Stripe' })
  const j = await makeJob(u.id, co.id, {
    title: 'Staff Payments Engineer',
    parsedMeta: { tech_stack: ['go', 'kafka'] },
    benefits: { equity: true },
  })
  const app = await makeApplication(u.id, j.id, {
    status: 'applied',
    appliedAt: new Date('2026-09-10T00:00:00Z'),
  })
  await saveMasterCV(u.id, makeCv())
  return { u, co, j, app }
}

async function updateJobParsedMeta(userId: string, jobId: string, meta: unknown) {
  await db
    .update(jobs)
    .set({ parsedMeta: meta as never, updatedAt: new Date() })
    .where(and(eq(jobs.userId, userId), eq(jobs.id, jobId)))
}

describe('checkDocumentStaleness — tailored_cv', () => {
  it('returns fresh when nothing has changed', async () => {
    const { u, app } = await seed('sc-tailored-fresh@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('fresh')
    expect(result.previousSnapshot).not.toBeNull()
  })

  it('escalates to critical when job.parsedMeta drifts', async () => {
    const { u, j, app } = await seed('sc-tailored-critical@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    await updateJobParsedMeta(u.id, j.id, { tech_stack: ['rust', 'ts'] })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
    expect(result.changedFields).toContain('job.parsedMeta')
  })

  it('flags minor drift when only job.benefits changes', async () => {
    const { u, j, app } = await seed('sc-tailored-minor@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    await db
      .update(jobs)
      .set({ benefits: { equity: false } as never, updatedAt: new Date() })
      .where(and(eq(jobs.userId, u.id), eq(jobs.id, j.id)))
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('minor')
    expect(result.changedFields).toContain('job.benefits')
  })
})

describe('checkDocumentStaleness — cover_letter', () => {
  it('returns fresh right after generation', async () => {
    const { u, app } = await seed('sc-cover-fresh@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateCoverLetter({ userId: u.id, applicationId: app.id, ai })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('fresh')
  })

  it('escalates to critical when master CV is bumped', async () => {
    const { u, app } = await seed('sc-cover-critical@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateCoverLetter({ userId: u.id, applicationId: app.id, ai })
    // Save a new master with a different summary — should change the hash.
    await saveMasterCV(u.id, { ...makeCv(), summary: 'A completely new pitch.' })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
    expect(result.changedFields).toContain('master CV')
  })
})

describe('checkDocumentStaleness — outreach (non-followup)', () => {
  it('critical when application.status flips', async () => {
    const { u, app } = await seed('sc-outreach-status@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'linkedin_connection',
      tone: 'friendly',
      ai,
    })
    await db
      .update(applications)
      .set({ status: 'interview', updatedAt: new Date() })
      .where(and(eq(applications.userId, u.id), eq(applications.id, app.id)))
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
  })
})

describe('checkDocumentStaleness — outreach_followup_email', () => {
  it('critical when a newer email activity arrives', async () => {
    const { u, app } = await seed('sc-followup-newmail@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'followup_email',
      tone: 'friendly',
      daysSince: 14,
      ai,
    })
    // Log a fresh activity after generation. The captured snapshot's
    // capturedAt is `now`, so wait one tick then insert.
    await new Promise((r) => setTimeout(r, 10))
    await activitiesQ.log(u.id, app.id, 'email', { subject: 'Following up' })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
    expect(result.summary).toMatch(/new/i)
  })

  it('stays fresh when no new activity', async () => {
    const { u, app } = await seed('sc-followup-fresh@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateOutreachDraft({
      userId: u.id,
      applicationId: app.id,
      kind: 'followup_email',
      tone: 'friendly',
      daysSince: 7,
      ai,
    })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('fresh')
  })
})

describe('checkDocumentStaleness — interview_prep_pack', () => {
  it('critical when stage.kind changes', async () => {
    const u = await makeUser('sc-prep-kind@x.com')
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, co.id, { title: 'Staff Engineer' })
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      title: null,
      scheduledAt: new Date('2026-10-01T10:00:00Z'),
      durationMinutes: 60,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'scheduled',
    })
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateInterviewPrepPack({
      userId: u.id,
      applicationId: app.id,
      stageKind: 'tech_screen',
      stageId: stage.id,
      ai,
    })
    await db
      .update(interviewStages)
      .set({ kind: 'system_design', updatedAt: new Date() })
      .where(and(eq(interviewStages.userId, u.id), eq(interviewStages.id, stage.id)))
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
    expect(result.changedFields).toContain('stage.kind')
  })

  it('critical when scheduledAt moves more than 6 hours', async () => {
    const u = await makeUser('sc-prep-reschedule@x.com')
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, co.id, { title: 'Staff Engineer' })
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'behavioral',
      title: null,
      scheduledAt: new Date('2026-10-01T10:00:00Z'),
      durationMinutes: 60,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'scheduled',
    })
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateInterviewPrepPack({
      userId: u.id,
      applicationId: app.id,
      stageKind: 'behavioral',
      stageId: stage.id,
      ai,
    })
    await db
      .update(interviewStages)
      .set({
        scheduledAt: new Date('2026-10-02T10:00:00Z'),
        updatedAt: new Date(),
      })
      .where(and(eq(interviewStages.userId, u.id), eq(interviewStages.id, stage.id)))
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
    expect(result.changedFields.some((f) => /scheduledAt/i.test(f))).toBe(true)
  })
})

describe('checkDocumentStaleness — interview_debrief', () => {
  it('fresh when the stage still exists', async () => {
    const u = await makeUser('sc-debrief-fresh@x.com')
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, co.id, { title: 'Staff Engineer' })
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      title: null,
      scheduledAt: null,
      durationMinutes: null,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'completed',
    })
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({ userId: u.id, stageId: stage.id, notesMd: '- Q?' })
    const ai = new FixtureAIProvider()
    const doc = await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('fresh')
  })

  it('critical when the underlying stage is deleted', async () => {
    const u = await makeUser('sc-debrief-deleted@x.com')
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const j = await makeJob(u.id, co.id, { title: 'Staff Engineer' })
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      title: null,
      scheduledAt: null,
      durationMinutes: null,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'completed',
    })
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({ userId: u.id, stageId: stage.id, notesMd: '- Q?' })
    const ai = new FixtureAIProvider()
    const doc = await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    await stagesQ.remove(u.id, stage.id)
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
  })
})

describe('checkDocumentStaleness — merged_pdf', () => {
  it('critical when a source doc version bumps', async () => {
    const u = await makeUser('sc-merged@x.com')
    // Two host docs used only as source rows for the merge snapshot.
    const src = await documentsQ.create(u.id, {
      applicationId: null,
      kind: 'latex_cv',
      version: 1,
      title: 'src',
      content: { source: '' },
    })
    const snapshot = snapshotForMerged([src])
    const doc = await documentsQ.create(u.id, {
      applicationId: null,
      kind: 'merged_pdf',
      version: 1,
      title: 'Merged',
      content: {
        sourceRefs: [{ kind: 'document', id: src.id }],
        mergedAt: new Date().toISOString(),
        stateSnapshot: snapshot,
      },
    })
    // Bump the source doc's version.
    await documentsQ.update(u.id, src.id, { version: 2 })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('critical')
  })
})

describe('checkDocumentStaleness — pre-v9 document', () => {
  it('treats a doc without stateSnapshot as fresh', async () => {
    const u = await makeUser('sc-prev9@x.com')
    const doc = await documentsQ.create(u.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'old',
      content: {
        basics: { name: 'x', headline: 'y' },
        summary: '',
        experience: [],
        skills: { primary: [] },
      },
    })
    const result = await checkDocumentStaleness(u.id, doc.id)
    expect(result.severity).toBe('fresh')
    expect(result.previousSnapshot).toBeNull()
    expect(result.summary).toMatch(/no.*snapshot/i)
  })
})

describe('GET /api/documents/[id]/staleness', () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)
    const route = await import('@/app/api/documents/[id]/staleness/route')
    const res = await route.GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a document owned by another user', async () => {
    const owner = await makeUser('sc-route-owner@x.com')
    const other = await makeUser('sc-route-other@x.com')
    const doc = await documentsQ.create(owner.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'x',
      content: {},
    })
    authMock.mockResolvedValue({ user: { id: other.id } })
    const route = await import('@/app/api/documents/[id]/staleness/route')
    const res = await route.GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: doc.id }),
    })
    expect(res.status).toBe(404)
  })

  it('returns severity payload for the owner', async () => {
    const { u, app } = await seed('sc-route-ok@x.com')
    const ai = new FixtureAIProvider()
    const doc = await generateTailoredCV({ userId: u.id, applicationId: app.id, ai })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await import('@/app/api/documents/[id]/staleness/route')
    const res = await route.GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: doc.id }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { severity: string; changedFields: string[] }
    expect(body.severity).toBe('fresh')
    expect(Array.isArray(body.changedFields)).toBe(true)
  })
})
