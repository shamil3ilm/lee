import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { enqueueSourcePollNow, scheduleUserToday } from '@/lib/queue/scheduler'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeSource, makeUser } from '@/tests/factories'

async function jobsOf(userId: string) {
  return db.select().from(queueJobs).where(eq(queueJobs.userId, userId))
}

describe('scheduleUserToday', () => {
  it("queues today's work for one user, including one poll per active source", async () => {
    const u = await makeUser()
    const other = await makeUser()
    const s1 = await makeSource(u.id)
    await makeSource(other.id)

    const r = await scheduleUserToday(u.id, new Date('2026-09-26T10:00:00Z'))
    expect(r.enqueued).toBeGreaterThan(0)

    const rows = await jobsOf(u.id)
    const polls = rows.filter((j) => j.type === JOB_TYPES.discoverySource)
    expect(polls).toHaveLength(1)
    expect((polls[0]!.payload as { sourceId: string }).sourceId).toBe(s1.id)
    expect(rows.some((j) => j.type === JOB_TYPES.followups)).toBe(true)
    // Other users are untouched.
    expect(await jobsOf(other.id)).toHaveLength(0)
  })

  it('is idempotent within the same UTC day', async () => {
    const u = await makeUser()
    await makeSource(u.id)
    const at = new Date('2026-09-26T10:00:00Z')
    await scheduleUserToday(u.id, at)
    const again = await scheduleUserToday(u.id, new Date('2026-09-26T18:00:00Z'))
    expect(again.enqueued).toBe(0)
  })
})

describe('enqueueSourcePollNow', () => {
  it("queues just that source's poll for today, once", async () => {
    const u = await makeUser()
    const s = await makeSource(u.id)
    const at = new Date('2026-09-26T10:00:00Z')
    expect(await enqueueSourcePollNow(u.id, s.id, at)).toBe(true)
    expect(await enqueueSourcePollNow(u.id, s.id, at)).toBe(false)
    const rows = await jobsOf(u.id)
    expect(rows.map((j) => j.type)).toEqual([JOB_TYPES.discoverySource])
  })
})
