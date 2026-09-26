import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications } from '@/lib/db/schema'
import { changeApplicationStatus } from '@/app/(authed)/actions'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('@/lib/auth', () => ({ signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function statusOf(id: string): Promise<string | undefined> {
  const [row] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, id))
  return row?.status
}

async function seedApp(userId: string) {
  const co = await makeCompany(userId)
  const job = await makeJob(userId, co.id)
  return makeApplication(userId, job.id)
}

beforeEach(() => {
  sessionMock.mockReset()
})

describe('applications board move (changeApplicationStatus)', () => {
  it('moves the card to another pipeline column', async () => {
    const me = await makeUser()
    const app = await seedApp(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await changeApplicationStatus(app.id, 'interview')).toEqual({ success: true })
    expect(await statusOf(app.id)).toBe('interview')
  })

  it('rejects an unknown column and a malformed id before touching the DB', async () => {
    const me = await makeUser()
    const app = await seedApp(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await changeApplicationStatus(app.id, 'hired')).toEqual({ error: 'Invalid move.' })
    expect(await changeApplicationStatus('not-a-uuid', 'offer')).toEqual({ error: 'Invalid move.' })
    expect(await statusOf(app.id)).toBe('saved')
    expect(sessionMock).not.toHaveBeenCalled()
  })

  it("cannot move another user's application", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await seedApp(other.id)
    sessionMock.mockResolvedValue(me.id)
    const r = await changeApplicationStatus(theirs.id, 'offer')
    expect(r).toEqual({ error: 'Could not update status.' })
    expect(await statusOf(theirs.id)).toBe('saved')
  })
})
