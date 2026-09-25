import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import { saveProfile } from '@/lib/profile/service'
import { getNextBestAction, getSetupChecklist } from '@/lib/journey/service'
import { findLowestCvFit } from '@/lib/journey/cv-fit'
import {
  makeApplication,
  makeCompany,
  makeDiscovery,
  makeJob,
  makeSource,
  makeUser,
} from '@/tests/factories'

const D = 24 * 60 * 60 * 1000
const BASE = new Date('2026-09-01T09:00:00Z').getTime()

interface AppOpts {
  company?: string | null
  title?: string
  status?: string
  appliedAt?: Date
}

async function makeApp(userId: string, opts: AppOpts = {}) {
  const c = opts.company === null ? null : await makeCompany(userId, { name: opts.company ?? 'Stripe' })
  const j = await makeJob(userId, c?.id ?? null, { title: opts.title ?? 'Senior BE' })
  return makeApplication(userId, j.id, {
    status: opts.status ?? 'saved',
    ...(opts.appliedAt ? { appliedAt: opts.appliedAt } : {}),
  })
}

interface ScoreOpts {
  applicationId?: string | null
  mode?: 'jd' | 'general'
  day?: number
}

/** Insert a cv_scores row directly with an explicit timestamp for ordering. */
async function addScore(userId: string, overall: number, opts: ScoreOpts = {}) {
  await db.insert(s.cvScores).values({
    userId,
    applicationId: opts.applicationId ?? null,
    sourceKind: 'master_cv',
    sourceLabel: 'Master CV',
    overall,
    grade: 'C',
    mode: opts.mode ?? 'jd',
    scores: {},
    dimensions: {},
    findings: [],
    scorerVersion: 'test',
    createdAt: new Date(BASE + (opts.day ?? 0) * D),
  })
}

describe('setup checklist: Score your CV', () => {
  it('lists the item as not done for a fresh user', async () => {
    const u = await makeUser()
    const res = await getSetupChecklist(u.id)
    const item = res.items.find((i) => i.key === 'cv_score')
    expect(item).toMatchObject({ label: 'Score your CV', done: false, href: '/cv-score' })
  })

  it('is done once any cv_scores row exists, general or job-matched', async () => {
    const u = await makeUser()
    await addScore(u.id, 55, { mode: 'general' })
    const res = await getSetupChecklist(u.id)
    expect(res.items.find((i) => i.key === 'cv_score')?.done).toBe(true)
    expect(res.completed).toBe(1)
  })

  it('ignores another user\'s scores', async () => {
    const u = await makeUser()
    const other = await makeUser()
    await addScore(other.id, 90)
    const res = await getSetupChecklist(u.id)
    expect(res.items.find((i) => i.key === 'cv_score')?.done).toBe(false)
  })
})

describe('findLowestCvFit', () => {
  it('returns null when nothing is scored', async () => {
    const u = await makeUser()
    await makeApp(u.id)
    expect(await findLowestCvFit(u.id)).toBeNull()
  })

  it('uses the LATEST score per application, not an old low one', async () => {
    const u = await makeUser()
    const app = await makeApp(u.id)
    await addScore(u.id, 40, { applicationId: app.id, day: 0 })
    await addScore(u.id, 82, { applicationId: app.id, day: 1 })
    expect(await findLowestCvFit(u.id)).toBeNull()
  })

  it('flags a latest score that dropped below the target', async () => {
    const u = await makeUser()
    const app = await makeApp(u.id)
    await addScore(u.id, 80, { applicationId: app.id, day: 0 })
    await addScore(u.id, 64, { applicationId: app.id, day: 1 })
    expect(await findLowestCvFit(u.id)).toMatchObject({ applicationId: app.id, overall: 64 })
  })

  it('treats 70 as passing and 69 as below target', async () => {
    const u = await makeUser()
    const ok = await makeApp(u.id, { company: 'Linear' })
    await addScore(u.id, 70, { applicationId: ok.id })
    expect(await findLowestCvFit(u.id)).toBeNull()
    const low = await makeApp(u.id, { company: 'Vercel' })
    await addScore(u.id, 69, { applicationId: low.id })
    expect(await findLowestCvFit(u.id)).toMatchObject({ applicationId: low.id, companyName: 'Vercel' })
  })

  it('picks the lowest-scoring saved application', async () => {
    const u = await makeUser()
    const a = await makeApp(u.id, { company: 'Stripe' })
    const b = await makeApp(u.id, { company: 'Monzo' })
    await addScore(u.id, 61, { applicationId: a.id })
    await addScore(u.id, 48, { applicationId: b.id })
    expect(await findLowestCvFit(u.id)).toMatchObject({
      applicationId: b.id,
      overall: 48,
      companyName: 'Monzo',
    })
  })

  it('ignores applications that are already applied or further along', async () => {
    const u = await makeUser()
    for (const status of ['applied', 'screen', 'interview', 'offer', 'rejected', 'withdrawn']) {
      const app = await makeApp(u.id, { status })
      await addScore(u.id, 30, { applicationId: app.id })
    }
    expect(await findLowestCvFit(u.id)).toBeNull()
  })

  it('ignores general (no job) scores and other users\' data', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const app = await makeApp(u.id)
    await addScore(u.id, 30, { applicationId: app.id, mode: 'general' })
    await addScore(u.id, 30, { mode: 'jd' })
    const theirs = await makeApp(other.id)
    await addScore(other.id, 20, { applicationId: theirs.id })
    expect(await findLowestCvFit(u.id)).toBeNull()
  })

  it('falls back to the job title when the job has no company', async () => {
    const u = await makeUser()
    const app = await makeApp(u.id, { company: null, title: 'Platform Engineer' })
    await addScore(u.id, 50, { applicationId: app.id })
    expect(await findLowestCvFit(u.id)).toMatchObject({
      companyName: null,
      jobTitle: 'Platform Engineer',
    })
  })
})

describe('getNextBestAction: cv_fit', () => {
  it('nudges to tailor a low-scoring saved application', async () => {
    const u = await makeUser()
    const app = await makeApp(u.id)
    await addScore(u.id, 58, { applicationId: app.id })
    const res = await getNextBestAction(u.id, new Date())
    expect(res.kind).toBe('cv_fit')
    expect(res.title).toBe('Your CV scores 58 for Stripe — tailor before applying')
    expect(res.description).toContain('Senior BE at Stripe')
    expect(res.href).toBe(`/applications/${app.id}`)
  })

  it('names the job title when there is no company', async () => {
    const u = await makeUser()
    const app = await makeApp(u.id, { company: null, title: 'Platform Engineer' })
    await addScore(u.id, 58, { applicationId: app.id })
    const res = await getNextBestAction(u.id, new Date())
    expect(res.title).toBe('Your CV scores 58 for Platform Engineer — tailor before applying')
  })

  it('ranks below a due follow-up', async () => {
    const u = await makeUser()
    const now = new Date()
    await makeApp(u.id, { status: 'applied', appliedAt: new Date(now.getTime() - 8 * D) })
    const saved = await makeApp(u.id, { company: 'Monzo' })
    await addScore(u.id, 40, { applicationId: saved.id })
    expect((await getNextBestAction(u.id, now)).kind).toBe('follow_up')
  })

  it('ranks above a high-match discovery', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { notifyDiscoveryMinScore: 80 })
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id, { matchScore: 95 })
    const app = await makeApp(u.id)
    await addScore(u.id, 40, { applicationId: app.id })
    expect((await getNextBestAction(u.id, new Date())).kind).toBe('cv_fit')
  })
})
