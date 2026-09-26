import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'
import { setStageStatus } from '@/app/(authed)/applications/[id]/actions'
import { stageBoardColumn } from '@/lib/stages/status'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function seedStage(userId: string) {
  const co = await makeCompany(userId)
  const job = await makeJob(userId, co.id)
  const app = await makeApplication(userId, job.id)
  // No scheduledAt: the status change never touches Google Calendar.
  const [stage] = await db
    .insert(interviewStages)
    .values({ userId, applicationId: app.id, kind: 'technical' })
    .returning()
  return stage!
}

async function statusOf(id: string): Promise<string | undefined> {
  const [r] = await db.select({ s: interviewStages.status }).from(interviewStages).where(eq(interviewStages.id, id))
  return r?.s
}

beforeEach(() => sessionMock.mockReset())

describe('setStageStatus (interview stages board)', () => {
  it('moves a stage between Scheduled, Done and Cancelled', async () => {
    const me = await makeUser()
    const s = await seedStage(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await statusOf(s.id)).toBe('scheduled')
    expect(await setStageStatus(s.id, 'completed')).toEqual({ success: true })
    expect(await statusOf(s.id)).toBe('completed')
    expect(await setStageStatus(s.id, 'cancelled')).toEqual({ success: true })
    expect(await statusOf(s.id)).toBe('cancelled')
    expect(await setStageStatus(s.id, 'scheduled')).toEqual({ success: true })
    expect(await statusOf(s.id)).toBe('scheduled')
  })

  it('validates the status and id with zod', async () => {
    const me = await makeUser()
    const s = await seedStage(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await setStageStatus(s.id, 'postponed')).toEqual({ error: 'Invalid stage status.' })
    expect(await setStageStatus('abc', 'completed')).toEqual({ error: 'Invalid stage status.' })
    expect(await statusOf(s.id)).toBe('scheduled')
  })

  it("cannot move another user's stage", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await seedStage(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await setStageStatus(theirs.id, 'completed')).toEqual({ error: 'Stage not found.' })
    expect(await statusOf(theirs.id)).toBe('scheduled')
  })

  it('puts no-shows in the Cancelled column', () => {
    expect(stageBoardColumn('no_show')).toBe('cancelled')
    expect(stageBoardColumn('completed')).toBe('completed')
    expect(stageBoardColumn('scheduled')).toBe('scheduled')
    expect(stageBoardColumn('mystery')).toBe('scheduled')
  })
})
