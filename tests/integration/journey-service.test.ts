import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as todosQ from '@/lib/db/queries/todos'
import * as stagesQ from '@/lib/db/queries/stages'
import * as documentsQ from '@/lib/db/queries/documents'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { saveProfile } from '@/lib/profile/service'
import {
  GMAIL_READ_SCOPE,
  getJourneyCounts,
  getNextBestAction,
  getSetupChecklist,
} from '@/lib/journey/service'
import {
  makeApplication,
  makeCompany,
  makeDiscovery,
  makeJob,
  makeSource,
  makeUser,
} from '@/tests/factories'

const H = 60 * 60 * 1000
const D = 24 * H

async function makeApp(userId: string, overrides: Partial<typeof s.applications.$inferInsert> = {}) {
  const c = await makeCompany(userId, { name: 'Stripe' })
  const j = await makeJob(userId, c.id, { title: 'Senior BE' })
  return makeApplication(userId, j.id, overrides)
}

async function connectGoogle(userId: string, scope: string) {
  await db.insert(s.accounts).values({
    userId,
    type: 'oidc',
    provider: 'google',
    providerAccountId: `g-${userId}`,
    scope,
  })
}

describe('getSetupChecklist', () => {
  it('reports every item as not done for a fresh user', async () => {
    const u = await makeUser()
    const res = await getSetupChecklist(u.id)
    expect(res.total).toBe(6)
    expect(res.completed).toBe(0)
    expect(res.items.map((i) => i.key)).toEqual([
      'profile',
      'master_cv',
      'cv_score',
      'source',
      'google',
      'application',
    ])
    expect(res.items.every((i) => i.href.startsWith('/'))).toBe(true)
  })

  it('marks every item done once the user is set up', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { skills: ['go'] })
    const cv = await documentsQ.create(u.id, { kind: 'master_cv', title: 'CV', content: {} })
    await cvScoresQ.create(u.id, {
      documentId: cv.id,
      sourceKind: 'master_cv',
      overall: 72,
      grade: 'C',
      scores: {},
      dimensions: {},
      findings: [],
      scorerVersion: 'test',
    })
    await makeSource(u.id)
    await connectGoogle(u.id, `openid email ${GMAIL_READ_SCOPE}`)
    await makeApp(u.id)
    const res = await getSetupChecklist(u.id)
    expect(res.completed).toBe(6)
    expect(res.items.every((i) => i.done)).toBe(true)
  })

  it('accepts a headline alone as an imported profile', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { headline: 'Backend engineer' })
    const res = await getSetupChecklist(u.id)
    expect(res.items.find((i) => i.key === 'profile')?.done).toBe(true)
  })

  it('does not count an empty profile or google without the gmail scope', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { headline: '   ' })
    await connectGoogle(u.id, 'openid email')
    const res = await getSetupChecklist(u.id)
    expect(res.items.find((i) => i.key === 'profile')?.done).toBe(false)
    expect(res.items.find((i) => i.key === 'google')?.done).toBe(false)
  })

  it('does not see another user’s data', async () => {
    const u = await makeUser()
    const other = await makeUser()
    await makeSource(other.id)
    await makeApp(other.id)
    const res = await getSetupChecklist(u.id)
    expect(res.completed).toBe(0)
  })
})

describe('getNextBestAction', () => {
  it('falls back to "add an application" when nothing is pending', async () => {
    const u = await makeUser()
    const res = await getNextBestAction(u.id, new Date())
    expect(res.kind).toBe('add_application')
    expect(res.href).toBe('/applications/new')
  })

  it('prioritises an overdue todo above everything else', async () => {
    const u = await makeUser()
    const now = new Date()
    await todosQ.create(u.id, { title: 'Email Nadia', dueAt: new Date(now.getTime() - H) })
    // Lower-priority signals also present.
    const app = await makeApp(u.id)
    await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      scheduledAt: new Date(now.getTime() + 2 * H),
    })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('overdue_todo')
    expect(res.title).toContain('Email Nadia')
    expect(res.href).toBe('/todos')
  })

  it('ignores done todos and todos due in the future', async () => {
    const u = await makeUser()
    const now = new Date()
    await todosQ.create(u.id, { title: 'later', dueAt: new Date(now.getTime() + H) })
    await todosQ.create(u.id, { title: 'done', status: 'done', dueAt: new Date(now.getTime() - H) })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('add_application')
  })

  it('suggests prep for an interview within 48h with no prep pack', async () => {
    const u = await makeUser()
    const now = new Date()
    const app = await makeApp(u.id, { status: 'interview' })
    await stagesQ.create(u.id, app.id, {
      kind: 'system_design',
      scheduledAt: new Date(now.getTime() + 24 * H),
    })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('interview_prep')
    expect(res.href).toBe(`/applications/${app.id}`)
    expect(res.description).toContain('Senior BE at Stripe')
  })

  it('skips interview prep when a prep pack exists or the interview is beyond 48h', async () => {
    const u = await makeUser()
    const now = new Date()
    const prepped = await makeApp(u.id, { status: 'interview' })
    await stagesQ.create(u.id, prepped.id, {
      kind: 'tech_screen',
      scheduledAt: new Date(now.getTime() + 5 * H),
    })
    await documentsQ.create(u.id, {
      applicationId: prepped.id,
      kind: 'interview_prep_pack',
      title: 'Prep',
      content: {},
    })
    const far = await makeApp(u.id, { status: 'interview' })
    await stagesQ.create(u.id, far.id, {
      kind: 'tech_screen',
      scheduledAt: new Date(now.getTime() + 72 * H),
    })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('add_application')
  })

  it('asks for a debrief on a recently completed stage with empty notes', async () => {
    const u = await makeUser()
    const now = new Date()
    const app = await makeApp(u.id, { status: 'interview' })
    await stagesQ.create(u.id, app.id, {
      kind: 'behavioral',
      status: 'completed',
      scheduledAt: new Date(now.getTime() - D),
      debriefNotesMd: '  ',
    })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('debrief')
    expect(res.href).toBe(`/applications/${app.id}`)
  })

  it('does not ask for a debrief when notes exist or the stage is stale', async () => {
    const u = await makeUser()
    const now = new Date()
    const app = await makeApp(u.id, { status: 'interview' })
    await stagesQ.create(u.id, app.id, {
      kind: 'behavioral',
      status: 'completed',
      debriefNotesMd: 'Went well',
    })
    await db.insert(s.interviewStages).values({
      userId: u.id,
      applicationId: app.id,
      kind: 'tech_screen',
      status: 'completed',
      updatedAt: new Date(now.getTime() - 30 * D),
    })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('add_application')
  })

  it('suggests a follow-up for a stale applied application', async () => {
    const u = await makeUser()
    const now = new Date()
    const app = await makeApp(u.id, {
      status: 'applied',
      appliedAt: new Date(now.getTime() - 8 * D),
    })
    const res = await getNextBestAction(u.id, now)
    expect(res.kind).toBe('follow_up')
    expect(res.href).toBe(`/applications/${app.id}`)
    expect(res.description).toContain('8 days')
  })

  it('surfaces a high-match unreviewed discovery above the profile threshold', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { notifyDiscoveryMinScore: 80 })
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id, { matchScore: 70 })
    await makeDiscovery(u.id, src.id, {
      matchScore: 91,
      normalized: { title: 'Staff Eng', companyName: 'Linear' },
    })
    await makeDiscovery(u.id, src.id, { matchScore: 99, status: 'dismissed' })
    const res = await getNextBestAction(u.id, new Date())
    expect(res.kind).toBe('discovery')
    expect(res.title).toContain('91%')
    expect(res.description).toContain('Staff Eng at Linear')
    expect(res.href).toContain('minScore=80')
  })

  it('uses the default threshold (75) when there is no profile', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id, { matchScore: 74 })
    expect((await getNextBestAction(u.id, new Date())).kind).toBe('add_application')
    await makeDiscovery(u.id, src.id, { matchScore: 75 })
    expect((await getNextBestAction(u.id, new Date())).kind).toBe('discovery')
  })
})

describe('getJourneyCounts', () => {
  it('returns zeros for a fresh user', async () => {
    const u = await makeUser()
    expect(await getJourneyCounts(u.id)).toEqual({
      found: 0,
      applied: 0,
      interviewing: 0,
      offers: 0,
    })
  })

  it('counts new discoveries and applications by journey stage', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id)
    await makeDiscovery(u.id, src.id)
    await makeDiscovery(u.id, src.id, { status: 'saved' })
    await makeApp(u.id, { status: 'applied' })
    await makeApp(u.id, { status: 'screen' })
    await makeApp(u.id, { status: 'interview' })
    await makeApp(u.id, { status: 'offer' })
    await makeApp(u.id, { status: 'rejected' })
    await makeApp(other.id, { status: 'offer' })
    expect(await getJourneyCounts(u.id)).toEqual({
      found: 2,
      applied: 1,
      interviewing: 2,
      offers: 1,
    })
  })
})
