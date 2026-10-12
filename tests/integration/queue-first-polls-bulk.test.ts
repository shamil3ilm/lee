import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * queueFirstPolls inside a request (a bulk "Turn on" of many sources): every
 * source gets one queued poll, but only the first few — never-polled, then
 * the stalest — are drained right after the response. The rest wait for the
 * next drain, so 100 sources never run 100 polls inline.
 */

interface DrainCall {
  jobIds?: readonly string[]
  maxJobs?: number
  concurrency?: number
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
  const { and, eq } = await import('drizzle-orm')
  const { db } = await import('@/lib/db/client')
  const { queueJobs } = await import('@/lib/db/schema')
  const { queueFirstPolls, BULK_INLINE_POLLS } = await import('@/lib/queue/first-poll')
  const { makeSource, makeUser } = await import('@/tests/factories')
  const pollsOf = async (userId: string) =>
    (
      await db
        .select({ id: queueJobs.id, payload: queueJobs.payload })
        .from(queueJobs)
        .where(and(eq(queueJobs.userId, userId), eq(queueJobs.status, 'queued')))
    ).map((r) => ({ id: r.id, sourceId: String((r.payload as { sourceId?: string }).sourceId) }))
  return { queueFirstPolls, BULK_INLINE_POLLS, makeSource, makeUser, pollsOf }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

describe('queueFirstPolls inside a request', () => {
  it('queues every source once and drains only the first few, never-polled then stalest', async () => {
    const { queueFirstPolls, BULK_INLINE_POLLS, makeSource, makeUser, pollsOf } = await load()
    const u = await makeUser()
    const fresh = await makeSource(u.id, { lastPolledAt: daysAgo(1) })
    const stale = await makeSource(u.id, { lastPolledAt: daysAgo(9) })
    const never = await makeSource(u.id, { lastPolledAt: null })
    const older = await makeSource(u.id, { lastPolledAt: daysAgo(5) })
    const many = await Promise.all(Array.from({ length: 20 }, (_, i) => makeSource(u.id, { lastPolledAt: daysAgo(0.1 + i * 0.001) })))
    const all = [fresh, stale, never, older, ...many]

    const r = await queueFirstPolls(u.id, all)
    expect(r).toEqual({ created: all.length, queued: all.length, inline: BULK_INLINE_POLLS })

    const polls = await pollsOf(u.id)
    expect(polls).toHaveLength(all.length)
    expect(new Set(polls.map((p) => p.sourceId)).size).toBe(all.length)

    expect(scheduled).toHaveLength(1)
    await scheduled[0]!()
    expect(drained).toHaveLength(1)
    const jobOf = new Map(polls.map((p) => [p.sourceId, p.id]))
    expect([...drained[0]!.jobIds!].sort()).toEqual([never.id, stale.id, older.id].map((id) => jobOf.get(id)).sort())
    expect(drained[0]).toMatchObject({ maxJobs: BULK_INLINE_POLLS, concurrency: BULK_INLINE_POLLS })
  })

  it('a second call adds no polls (coalesced) and still drains only the few', async () => {
    const { queueFirstPolls, makeSource, makeUser, pollsOf } = await load()
    const u = await makeUser()
    const all = await Promise.all(Array.from({ length: 6 }, () => makeSource(u.id)))
    await queueFirstPolls(u.id, all)
    const again = await queueFirstPolls(u.id, all, new Date(), { manual: true })
    expect(again).toEqual({ created: 0, queued: 6, inline: 3 })
    expect(await pollsOf(u.id)).toHaveLength(6)
    await Promise.all(scheduled.map((t) => t()))
    expect(drained.map((d) => d.jobIds?.length)).toEqual([3, 3])
  })

  it('does nothing for an empty list', async () => {
    const { queueFirstPolls, makeUser } = await load()
    const u = await makeUser()
    expect(await queueFirstPolls(u.id, [])).toEqual({ created: 0, queued: 0, inline: 0 })
    expect(scheduled).toHaveLength(0)
  })
})
