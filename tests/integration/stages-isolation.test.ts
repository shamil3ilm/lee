import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, interviewStages } from '@/lib/db/schema'
import { createStage, ApplicationNotFoundError } from '@/lib/stages/service'
import { addStage } from '@/app/(authed)/applications/[id]/actions'
import { getRecentActivity, getUpcomingStages } from '@/lib/digest/service'
import { gatherPipelineSnapshot } from '@/lib/digest/weekly'
import { upcomingInterviews } from '@/lib/db/queries/academyJourney'
import { getNextBestAction } from '@/lib/journey/service'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

/**
 * Two-user isolation for interview stages (invite-beta audit §1.6, T1):
 * a stage/activity may only be attached to the caller's own application,
 * and reads that join stages/activities to applications never surface
 * another user's job title or company.
 */

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const HOUR = 3_600_000

async function victimApp() {
  const victim = await makeUser()
  const co = await makeCompany(victim.id, { name: 'Victim Secret Co' })
  const job = await makeJob(victim.id, co.id, { title: 'Victim Secret Role' })
  const app = await makeApplication(victim.id, job.id)
  return { victim, app }
}

function fd(values: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}

beforeEach(() => sessionMock.mockReset())

describe('stage writes: own applications only', () => {
  it('createStage refuses another user\'s application and writes nothing', async () => {
    const { app } = await victimApp()
    const attacker = await makeUser()
    await expect(
      createStage({ userId: attacker.id, applicationId: app.id, kind: 'phone_screen', scheduledAt: new Date(Date.now() + HOUR) }),
    ).rejects.toBeInstanceOf(ApplicationNotFoundError)
    expect(await db.select().from(interviewStages).where(eq(interviewStages.applicationId, app.id))).toEqual([])
    expect(await db.select().from(activities).where(eq(activities.applicationId, app.id))).toEqual([])
  })

  it('the addStage action returns an error for a foreign applicationId', async () => {
    const { app } = await victimApp()
    const attacker = await makeUser()
    sessionMock.mockResolvedValue(attacker.id)
    const res = await addStage(fd({ applicationId: app.id, kind: 'phone_screen' }))
    expect(res).toEqual({ error: 'Application not found.' })
    expect(await db.select().from(interviewStages).where(eq(interviewStages.applicationId, app.id))).toEqual([])
  })

  it('the addStage action rejects an unknown stage kind', async () => {
    const owner = await makeUser()
    const co = await makeCompany(owner.id)
    const app = await makeApplication(owner.id, (await makeJob(owner.id, co.id)).id)
    sessionMock.mockResolvedValue(owner.id)
    expect(await addStage(fd({ applicationId: app.id, kind: 'not-a-kind' }))).toEqual({ error: 'Invalid stage details.' })
  })

  it('the owner can still add a stage', async () => {
    const { victim, app } = await victimApp()
    sessionMock.mockResolvedValue(victim.id)
    expect(await addStage(fd({ applicationId: app.id, kind: 'phone_screen' }))).toEqual({ success: true })
  })
})

describe('stage/activity reads: never another user\'s job', () => {
  /** A cross-tenant row as the old bug could write it (attacker's user_id, victim's application). */
  async function plantForeignRows() {
    const { victim, app } = await victimApp()
    const attacker = await makeUser()
    const soon = new Date(Date.now() + 2 * HOUR)
    await db.insert(interviewStages).values({ userId: attacker.id, applicationId: app.id, kind: 'phone_screen', scheduledAt: soon, status: 'scheduled' })
    await db.insert(interviewStages).values({ userId: attacker.id, applicationId: app.id, kind: 'onsite', status: 'completed' })
    await db.insert(activities).values({ userId: attacker.id, applicationId: app.id, kind: 'stage_added', payload: {} })
    return { victim, attacker }
  }

  const leaks = (v: unknown) => JSON.stringify(v).includes('Victim Secret')

  it('digest upcoming stages and recent activity', async () => {
    const { attacker } = await plantForeignRows()
    expect(leaks(await getUpcomingStages(attacker.id))).toBe(false)
    expect(leaks(await getRecentActivity(attacker.id))).toBe(false)
  })

  it('weekly digest snapshot', async () => {
    const { attacker } = await plantForeignRows()
    expect(leaks(await gatherPipelineSnapshot(attacker.id))).toBe(false)
  })

  it('academy upcoming interviews', async () => {
    const { attacker } = await plantForeignRows()
    expect(leaks(await upcomingInterviews(attacker.id, new Date(), new Date(Date.now() + 48 * HOUR)))).toBe(false)
  })

  it('journey next best action', async () => {
    const { attacker } = await plantForeignRows()
    expect(leaks(await getNextBestAction(attacker.id, new Date()))).toBe(false)
  })
})
