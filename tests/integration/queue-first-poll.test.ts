import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { queueFirstPoll } from '@/lib/queue/first-poll'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeSource, makeUser } from '@/tests/factories'

describe('queueFirstPoll', () => {
  it('queues the new source poll; outside a request it does not run it inline (no network in tests)', async () => {
    const u = await makeUser()
    const s = await makeSource(u.id)
    expect(await queueFirstPoll(u.id, s.id)).toBe(true)
    const rows = await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: JOB_TYPES.discoverySource, status: 'queued' })
  })

  it("doesn't queue a second poll for the same source on the same day", async () => {
    const u = await makeUser()
    const s = await makeSource(u.id)
    await queueFirstPoll(u.id, s.id)
    expect(await queueFirstPoll(u.id, s.id)).toBe(false)
  })
})
