import { describe, it, expect } from 'vitest'
import { generateInterviewPrepPack } from '@/lib/documents/prep'
import { saveMasterCV } from '@/lib/documents/master'
import { MasterCVNotFoundError, ApplicationNotFoundError } from '@/lib/documents/errors'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as documentsQ from '@/lib/db/queries/documents'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import type { InterviewPrepPack, MasterCV } from '@/lib/documents/types'

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

describe('generateInterviewPrepPack', () => {
  it('persists an interview_prep_pack document', async () => {
    const { u, app } = await seed('prep-1@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateInterviewPrepPack({
      userId: u.id,
      applicationId: app.id,
      stageKind: 'tech_screen',
      ai,
    })
    expect(doc.kind).toBe('interview_prep_pack')
    expect(doc.version).toBe(1)
    expect(doc.title).toContain('Interview Prep')
    expect(doc.title).toContain('tech_screen')
    expect(doc.title).toContain('Stripe')
    const content = doc.content as InterviewPrepPack
    expect(content.stageKind).toBe('tech_screen')
    expect(content.likelyQuestions.length).toBeGreaterThan(0)
  })

  it('records the provided stageId', async () => {
    const { u, app } = await seed('prep-2@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    const doc = await generateInterviewPrepPack({
      userId: u.id,
      applicationId: app.id,
      stageKind: 'behavioral',
      stageId: 'stg-abc',
      ai,
    })
    const content = doc.content as InterviewPrepPack
    expect(content.stageId).toBe('stg-abc')
  })

  it('increments version on repeat generation', async () => {
    const { u, app } = await seed('prep-3@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await generateInterviewPrepPack({
      userId: u.id,
      applicationId: app.id,
      stageKind: 'tech_screen',
      ai,
    })
    const second = await generateInterviewPrepPack({
      userId: u.id,
      applicationId: app.id,
      stageKind: 'tech_screen',
      ai,
    })
    expect(second.version).toBe(2)
    const list = await documentsQ.list(u.id, {
      applicationId: app.id,
      kind: 'interview_prep_pack',
    })
    expect(list).toHaveLength(2)
  })

  it('throws MasterCVNotFoundError when no master saved', async () => {
    const { u, app } = await seed('prep-nomaster@x.com')
    const ai = new FixtureAIProvider()
    await expect(
      generateInterviewPrepPack({
        userId: u.id,
        applicationId: app.id,
        stageKind: 'tech_screen',
        ai,
      }),
    ).rejects.toBeInstanceOf(MasterCVNotFoundError)
  })

  it('throws ApplicationNotFoundError for missing app', async () => {
    const u = await makeUser('prep-noapp@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await expect(
      generateInterviewPrepPack({
        userId: u.id,
        applicationId: '00000000-0000-0000-0000-000000000000',
        stageKind: 'tech_screen',
        ai,
      }),
    ).rejects.toBeInstanceOf(ApplicationNotFoundError)
  })
})
