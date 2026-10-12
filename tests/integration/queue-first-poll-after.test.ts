import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * queueFirstPoll inside a request: the after-response drain must claim THE
 * new source's poll (by job id), not the user's oldest queued poll — the
 * production incident where a source added behind a backlog never ran.
 */

interface DrainCall {
  jobIds?: readonly string[]
  maxJobs?: number
}

let scheduled: Array<() => Promise<void>>
let drained: DrainCall[]

beforeEach(() => {
  scheduled = []
  drained = []
  vi.resetModules()
  vi.doMock('next/server', () => ({ after: (task: () => Promise<void>) => void scheduled.push(task) }))
  vi.doMock('@/lib/queue/drain', () => ({
    drain: async (opts: DrainCall) => {
      drained.push(opts)
      return {}
    },
  }))
})

afterEach(() => {
  vi.doUnmock('next/server')
  vi.doUnmock('@/lib/queue/drain')
  vi.resetModules()
})

async function load() {
  const { sql } = await import('drizzle-orm')
  const { db } = await import('@/lib/db/client')
  const { queueJobs } = await import('@/lib/db/schema')
  const { queueFirstPoll } = await import('@/lib/queue/first-poll')
  const { enqueueSourcePolls } = await import('@/lib/queue/scheduler')
  const { makeSource, makeUser } = await import('@/tests/factories')
  return { sql, db, queueJobs, queueFirstPoll, enqueueSourcePolls, makeSource, makeUser }
}

const TWO_DAYS_AGO = () => new Date(Date.now() - 2 * 86_400_000)

describe('queueFirstPoll inside a request', () => {
  it("drains the new source's own poll, not the user's oldest queued one", async () => {
    const { sql, db, queueJobs, queueFirstPoll, enqueueSourcePolls, makeSource, makeUser } = await load()
    const u = await makeUser()
    const old = await makeSource(u.id)
    await enqueueSourcePolls(u.id, [old.id], TWO_DAYS_AGO())
    const added = await makeSource(u.id)

    expect(await queueFirstPoll(u.id, added.id)).toBe(true)
    expect(scheduled).toHaveLength(1)
    await scheduled[0]!()
    const [mine] = await db
      .select({ id: queueJobs.id })
      .from(queueJobs)
      .where(sql`${queueJobs.payload}->>'sourceId' = ${added.id}`)
    expect(drained).toEqual([expect.objectContaining({ jobIds: [mine!.id], maxJobs: 1 })])
  })

  it('a source whose poll is already pending (e.g. behind a backlog) gets that poll run now', async () => {
    const { db, queueJobs, queueFirstPoll, enqueueSourcePolls, makeSource, makeUser } = await load()
    const u = await makeUser()
    const s = await makeSource(u.id)
    const queuedLongAgo = await enqueueSourcePolls(u.id, [s.id], TWO_DAYS_AGO())

    expect(await queueFirstPoll(u.id, s.id)).toBe(false) // nothing new inserted…
    await scheduled[0]!()
    expect(drained[0]?.jobIds).toEqual(queuedLongAgo.jobIds) // …but the pending poll runs now
    const rows = await db.select().from(queueJobs)
    expect(rows).toHaveLength(1)
  })
})
