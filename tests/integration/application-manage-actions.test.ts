import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  activities,
  applications,
  documents,
  interviewStages,
  jobs,
  todos,
} from '@/lib/db/schema'
import {
  updateJobDetails,
  deleteApplication,
  updateStageDetails,
  deleteStageAction,
} from '@/app/(authed)/applications/[id]/actions'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
// deleteApplication redirects on success; surface it as a throw we can assert.
const redirectMock = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  }),
)
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

function fd(values: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}

async function seedApp(userId: string) {
  const co = await makeCompany(userId)
  const job = await makeJob(userId, co.id, { title: 'Old title' })
  const app = await makeApplication(userId, job.id)
  return { co, job, app }
}

beforeEach(() => {
  sessionMock.mockReset()
  redirectMock.mockClear()
})

describe('updateJobDetails', () => {
  it('updates job fields and application fields', async () => {
    const me = await makeUser()
    const { job, app } = await seedApp(me.id)
    const other = await makeCompany(me.id, { name: 'Globex' })
    sessionMock.mockResolvedValue(me.id)

    const r = await updateJobDetails(
      app.id,
      fd({
        title: 'Staff Engineer',
        sourceUrl: 'https://globex.com/jobs/1',
        companyId: other.id,
        location: 'Dubai',
        remoteType: 'hybrid',
        employmentType: 'fulltime',
        salaryMin: '100000',
        salaryMax: '150000',
        salaryCurrency: 'aed',
        descriptionMd: 'Build things.',
        source: 'referral',
        interestLevel: '4',
      }),
    )
    expect(r).toEqual({ success: true })

    const [j] = await db.select().from(jobs).where(eq(jobs.id, job.id))
    expect(j).toMatchObject({
      title: 'Staff Engineer',
      sourceUrl: 'https://globex.com/jobs/1',
      companyId: other.id,
      location: 'Dubai',
      remoteType: 'hybrid',
      employmentType: 'fulltime',
      salaryMin: 100000,
      salaryMax: 150000,
      salaryCurrency: 'AED',
      descriptionMd: 'Build things.',
    })
    const [a] = await db.select().from(applications).where(eq(applications.id, app.id))
    expect(a).toMatchObject({ source: 'referral', interestLevel: 4 })
  })

  it('clears optional fields when left blank', async () => {
    const me = await makeUser()
    const co = await makeCompany(me.id)
    const job = await makeJob(me.id, co.id, { location: 'Remote', salaryMin: 5 })
    const app = await makeApplication(me.id, job.id, { interestLevel: 3 })
    sessionMock.mockResolvedValue(me.id)
    const r = await updateJobDetails(
      app.id,
      fd({ title: 'T', sourceUrl: job.sourceUrl, location: '', salaryMin: '', interestLevel: '' }),
    )
    expect(r).toEqual({ success: true })
    const [j] = await db.select().from(jobs).where(eq(jobs.id, job.id))
    expect(j?.location).toBeNull()
    expect(j?.salaryMin).toBeNull()
    const [a] = await db.select().from(applications).where(eq(applications.id, app.id))
    expect(a?.interestLevel).toBeNull()
  })

  it('validates input with friendly messages', async () => {
    const me = await makeUser()
    const { app, job } = await seedApp(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await updateJobDetails(app.id, fd({ title: '', sourceUrl: job.sourceUrl }))).toEqual({
      error: 'Title is required',
    })
    expect(
      await updateJobDetails(
        app.id,
        fd({ title: 'T', sourceUrl: job.sourceUrl, salaryMin: '200', salaryMax: '100' }),
      ),
    ).toEqual({ error: 'Maximum salary must be at least the minimum.' })
    expect(
      await updateJobDetails(app.id, fd({ title: 'T', sourceUrl: job.sourceUrl, remoteType: 'moon' })),
    ).toHaveProperty('error')
  })

  it('refuses a source URL already used by another of your jobs', async () => {
    const me = await makeUser()
    const { app } = await seedApp(me.id)
    const taken = await makeJob(me.id, null)
    sessionMock.mockResolvedValue(me.id)
    const r = await updateJobDetails(app.id, fd({ title: 'T', sourceUrl: taken.sourceUrl }))
    expect(r).toEqual({ error: 'Another job already uses that URL.' })
  })

  it("cannot edit another user's application or point it at their company", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await seedApp(other.id)
    const mine = await seedApp(me.id)
    sessionMock.mockResolvedValue(me.id)

    expect(
      await updateJobDetails(theirs.app.id, fd({ title: 'Hijack', sourceUrl: 'https://x.com/1' })),
    ).toEqual({ error: 'Application not found.' })
    const [j] = await db.select().from(jobs).where(eq(jobs.id, theirs.job.id))
    expect(j?.title).toBe('Old title')

    expect(
      await updateJobDetails(
        mine.app.id,
        fd({ title: 'T', sourceUrl: mine.job.sourceUrl, companyId: theirs.co.id }),
      ),
    ).toEqual({ error: 'Company not found.' })
  })
})

describe('deleteApplication', () => {
  it('deletes the application and its job; keeps documents and todos unlinked', async () => {
    const me = await makeUser()
    const { job, app } = await seedApp(me.id)
    await db.insert(activities).values({ userId: me.id, applicationId: app.id, kind: 'note' })
    const [doc] = await db
      .insert(documents)
      .values({ userId: me.id, applicationId: app.id, kind: 'cover_letter', title: 'CL', content: {} })
      .returning()
    const [todo] = await db
      .insert(todos)
      .values({ userId: me.id, title: 'Follow up', applicationId: app.id })
      .returning()
    sessionMock.mockResolvedValue(me.id)

    await expect(deleteApplication(app.id)).rejects.toThrow('NEXT_REDIRECT:/applications')

    expect(await db.select().from(applications).where(eq(applications.id, app.id))).toHaveLength(0)
    expect(await db.select().from(jobs).where(eq(jobs.id, job.id))).toHaveLength(0)
    const [d] = await db.select().from(documents).where(eq(documents.id, doc!.id))
    expect(d?.applicationId).toBeNull()
    const [t] = await db.select().from(todos).where(eq(todos.id, todo!.id))
    expect(t?.applicationId).toBeNull()
  })

  it('keeps the job when another application still uses it', async () => {
    const me = await makeUser()
    const { job, app } = await seedApp(me.id)
    await makeApplication(me.id, job.id)
    sessionMock.mockResolvedValue(me.id)
    await expect(deleteApplication(app.id)).rejects.toThrow('NEXT_REDIRECT')
    expect(await db.select().from(jobs).where(eq(jobs.id, job.id))).toHaveLength(1)
  })

  it("cannot delete another user's application", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await seedApp(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await deleteApplication(theirs.app.id)).toEqual({ error: 'Application not found.' })
    expect(redirectMock).not.toHaveBeenCalled()
    expect(await db.select().from(applications).where(eq(applications.id, theirs.app.id))).toHaveLength(1)
  })
})

describe('updateStageDetails / deleteStageAction', () => {
  async function seedStage(userId: string) {
    const { app } = await seedApp(userId)
    const [stage] = await db
      .insert(interviewStages)
      .values({ userId, applicationId: app.id, kind: 'phone_screen', title: 'Screen' })
      .returning()
    return { app, stage: stage! }
  }

  it('edits a stage', async () => {
    const me = await makeUser()
    const { stage } = await seedStage(me.id)
    sessionMock.mockResolvedValue(me.id)
    const when = '2030-01-15T10:00:00.000Z'
    const r = await updateStageDetails(
      stage.id,
      fd({
        kind: 'technical',
        title: 'Deep dive',
        scheduledAt: when,
        durationMinutes: '45',
        location: 'Office',
        meetingUrl: 'https://meet.example/x',
        prepNotesMd: 'Review system design',
      }),
    )
    expect(r).toEqual({ success: true })
    const [row] = await db.select().from(interviewStages).where(eq(interviewStages.id, stage.id))
    expect(row).toMatchObject({
      kind: 'technical',
      title: 'Deep dive',
      durationMinutes: 45,
      location: 'Office',
      meetingUrl: 'https://meet.example/x',
      prepNotesMd: 'Review system design',
    })
    expect(row?.scheduledAt?.toISOString()).toBe(when)
  })

  it('rejects an unknown kind', async () => {
    const me = await makeUser()
    const { stage } = await seedStage(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await updateStageDetails(stage.id, fd({ kind: 'party' }))).toEqual({
      error: 'Invalid stage details.',
    })
  })

  it('deletes a stage', async () => {
    const me = await makeUser()
    const { stage } = await seedStage(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await deleteStageAction(stage.id)).toEqual({ success: true })
    expect(await db.select().from(interviewStages).where(eq(interviewStages.id, stage.id))).toHaveLength(0)
  })

  it("cannot edit or delete another user's stage", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const { stage } = await seedStage(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await updateStageDetails(stage.id, fd({ kind: 'technical', title: 'X' }))).toEqual({
      error: 'Stage not found.',
    })
    expect(await deleteStageAction(stage.id)).toEqual({ error: 'Stage not found.' })
    const [row] = await db.select().from(interviewStages).where(eq(interviewStages.id, stage.id))
    expect(row?.title).toBe('Screen')
  })
})
