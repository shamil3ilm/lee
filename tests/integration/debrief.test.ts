import { describe, it, expect } from 'vitest'
import {
  EmptyDebriefNotesError,
  StageNotFoundError,
  generateAIDebrief,
  saveQuickDebrief,
} from '@/lib/documents/debrief'
import { saveMasterCV } from '@/lib/documents/master'
import { MasterCVNotFoundError } from '@/lib/documents/errors'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as stagesQ from '@/lib/db/queries/stages'
import * as documentsQ from '@/lib/db/queries/documents'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import type { InterviewDebrief, MasterCV } from '@/lib/documents/types'

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
  return { u, co, j, app, stage }
}

describe('saveQuickDebrief', () => {
  it('persists notesMd on the stage', async () => {
    const { u, stage } = await seed('debrief-quick-1@x.com')
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd: '## What went well\n- Nailed the SQL question',
    })
    const stages = await stagesQ.list(u.id, stage.applicationId)
    expect(stages[0]?.debriefNotesMd).toContain('Nailed the SQL question')
  })

  it('refuses to touch a stage owned by another user', async () => {
    const { stage } = await seed('debrief-quick-2@x.com')
    const other = await makeUser('debrief-quick-other@x.com')
    await expect(
      saveQuickDebrief({ userId: other.id, stageId: stage.id, notesMd: 'x' }),
    ).rejects.toBeInstanceOf(StageNotFoundError)
  })
})

describe('generateAIDebrief', () => {
  it('persists an interview_debrief document linked back to the stage', async () => {
    const { u, app, stage } = await seed('debrief-ai-1@x.com')
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd:
        '- What is your favourite recent project?\n- How would you scale this?\n',
    })
    const ai = new FixtureAIProvider()
    const doc = await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    expect(doc.kind).toBe('interview_debrief')
    expect(doc.version).toBe(1)
    expect(doc.applicationId).toBe(app.id)
    expect(doc.title).toContain('Debrief')
    expect(doc.title).toContain('tech_screen')
    expect(doc.title).toContain('Stripe')
    const content = doc.content as InterviewDebrief
    expect(content.stageId).toBe(stage.id)
    expect(content.applicationId).toBe(app.id)
    expect(content.questionsAsked.length).toBeGreaterThan(0)
    expect(['likely_advance', 'unclear', 'likely_rejected']).toContain(
      content.outcomeConfidence,
    )
  })

  it('embeds a v9 stateSnapshot in content', async () => {
    const { u, stage } = await seed('debrief-snap@x.com')
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd: '- Q?',
    })
    const ai = new FixtureAIProvider()
    const doc = await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    const content = doc.content as {
      stateSnapshot?: { hashes: Record<string, string>; fields: Record<string, unknown> }
    }
    expect(content.stateSnapshot?.hashes.stage).toMatch(/^[a-f0-9]{64}$/)
    expect(content.stateSnapshot?.fields.stageKind).toBe('tech_screen')
  })

  it('increments version on repeat generation', async () => {
    const { u, app, stage } = await seed('debrief-ai-2@x.com')
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd: '- Q1?\n',
    })
    const ai = new FixtureAIProvider()
    await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    const second = await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    expect(second.version).toBe(2)
    const list = await documentsQ.list(u.id, {
      applicationId: app.id,
      kind: 'interview_debrief',
    })
    expect(list).toHaveLength(2)
  })

  it('throws EmptyDebriefNotesError when quick notes are missing', async () => {
    const { u, stage } = await seed('debrief-ai-empty@x.com')
    await saveMasterCV(u.id, makeCv())
    const ai = new FixtureAIProvider()
    await expect(
      generateAIDebrief({ userId: u.id, stageId: stage.id, ai }),
    ).rejects.toBeInstanceOf(EmptyDebriefNotesError)
  })

  it('throws EmptyDebriefNotesError for whitespace-only notes', async () => {
    const { u, stage } = await seed('debrief-ai-blank@x.com')
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd: '   \n\n  \t  \n',
    })
    const ai = new FixtureAIProvider()
    await expect(
      generateAIDebrief({ userId: u.id, stageId: stage.id, ai }),
    ).rejects.toBeInstanceOf(EmptyDebriefNotesError)
  })

  it('throws MasterCVNotFoundError when no master saved', async () => {
    const { u, stage } = await seed('debrief-ai-nocv@x.com')
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd: '- Q?',
    })
    const ai = new FixtureAIProvider()
    await expect(
      generateAIDebrief({ userId: u.id, stageId: stage.id, ai }),
    ).rejects.toBeInstanceOf(MasterCVNotFoundError)
  })

  it('throws StageNotFoundError for a stage the user does not own', async () => {
    const { stage } = await seed('debrief-ai-notmine@x.com')
    const other = await makeUser('debrief-ai-other@x.com')
    await saveMasterCV(other.id, makeCv())
    const ai = new FixtureAIProvider()
    await expect(
      generateAIDebrief({ userId: other.id, stageId: stage.id, ai }),
    ).rejects.toBeInstanceOf(StageNotFoundError)
  })

  it('overrides AI-echoed stageId/applicationId with server values', async () => {
    const { u, app, stage } = await seed('debrief-ai-override@x.com')
    await saveMasterCV(u.id, makeCv())
    await saveQuickDebrief({
      userId: u.id,
      stageId: stage.id,
      notesMd: '- Q?',
    })
    const ai = new FixtureAIProvider({
      generateInterviewDebrief: () => ({
        stageId: 'wrong-id',
        applicationId: 'wrong-app',
        summary: 'x',
        wentWell: [],
        toImprove: [],
        questionsAsked: [],
        redFlags: [],
        followUpRecommendations: [],
        outcomeConfidence: 'unclear',
        reasoning: 'x',
      }),
    })
    const doc = await generateAIDebrief({ userId: u.id, stageId: stage.id, ai })
    const content = doc.content as InterviewDebrief
    expect(content.stageId).toBe(stage.id)
    expect(content.applicationId).toBe(app.id)
  })

})
