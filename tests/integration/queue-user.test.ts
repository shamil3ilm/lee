import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { queueJobs, queueUserState } from '@/lib/db/schema'
import { claim, enqueue, fail } from '@/lib/queue/queue'
import { createRegistry, defineHandler } from '@/lib/queue/registry'
import {
  claimVisitDrainSlot,
  scheduleVisitDrain,
  VISIT_DRAIN_INTERVAL_MS,
  VISIT_DRAIN_MAX_JOBS,
} from '@/lib/queue/visit'
import { getQueueOverview, RUN_NOW_INTERVAL_MS, runNowForUser } from '@/lib/queue/overview'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeUser } from '@/tests/factories'

const ran: string[] = []
const registry = createRegistry([
  defineHandler({
    type: 'user-task',
    scope: 'user',
    payload: z.object({}),
    timeoutMs: 5_000,
    async run({ job }) {
      ran.push(job.userId as string)
    },
  }),
])

async function statusOf(userId: string): Promise<string[]> {
  const rows = await db.select().from(queueJobs).where(eq(queueJobs.userId, userId))
  return rows.map((r) => r.status).sort()
}

describe('claimVisitDrainSlot', () => {
  it('wins only when the user has a due job, then at most once per interval', async () => {
    const u = await makeUser()
    const now = new Date()
    expect(await claimVisitDrainSlot(u.id, now)).toBe(false)
    // An idle visit writes nothing.
    expect(await db.select().from(queueUserState)).toHaveLength(0)

    await enqueue('user-task', {}, { userId: u.id, runAfter: new Date(now.getTime() - 1_000) })
    expect(await claimVisitDrainSlot(u.id, now)).toBe(true)
    expect(await claimVisitDrainSlot(u.id, new Date(now.getTime() + 60_000))).toBe(false)
    expect(await claimVisitDrainSlot(u.id, new Date(now.getTime() + VISIT_DRAIN_INTERVAL_MS))).toBe(true)
  })

  it('ignores jobs that are not due yet and other users’ jobs', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const now = new Date()
    await enqueue('user-task', {}, { userId: u.id, runAfter: new Date(now.getTime() + 60_000) })
    await enqueue('user-task', {}, { userId: other.id, runAfter: now })
    expect(await claimVisitDrainSlot(u.id, now)).toBe(false)
  })
})

describe('scheduleVisitDrain', () => {
  it(`drains at most ${VISIT_DRAIN_MAX_JOBS} of the visitor's own due jobs, throttled`, async () => {
    ran.length = 0
    const u = await makeUser()
    const other = await makeUser()
    for (let i = 0; i < 3; i++) await enqueue('user-task', {}, { userId: u.id })
    await enqueue('user-task', {}, { userId: other.id })

    // No request scope in tests: runAfterResponse runs the task inline.
    await scheduleVisitDrain(u.id, { registry })
    expect(ran).toEqual([u.id, u.id])
    expect(await statusOf(u.id)).toEqual(['done', 'done', 'queued'])
    expect(await statusOf(other.id)).toEqual(['queued'])

    await scheduleVisitDrain(u.id, { registry })
    expect(ran).toHaveLength(2)
    const [state] = await db.select().from(queueUserState).where(eq(queueUserState.userId, u.id))
    expect(state?.lastDrainAt).not.toBeNull()
  })

  it('never throws into the page, even if the drain fails', async () => {
    const u = await makeUser()
    await enqueue('user-task', {}, { userId: u.id })
    const broken = createRegistry([
      defineHandler({
        type: 'user-task',
        scope: 'user',
        payload: z.object({}),
        timeoutMs: 5_000,
        async run() {
          throw new Error('nope')
        },
      }),
    ])
    await expect(scheduleVisitDrain(u.id, { registry: broken })).resolves.toBeUndefined()
    expect(await statusOf(u.id)).toEqual(['failed'])
  })
})

describe('runNowForUser', () => {
  it("drains only this user's due jobs and is throttled", async () => {
    ran.length = 0
    const u = await makeUser()
    const other = await makeUser()
    await enqueue('user-task', {}, { userId: u.id })
    await enqueue('user-task', {}, { userId: other.id })
    const now = new Date()
    const noSchedule = async () => {}
    const r = await runNowForUser(u.id, { registry, now, scheduleToday: noSchedule })
    expect(r).toEqual({ status: 'ran', done: 1, failed: 0, remaining: 'none' })
    expect(ran).toEqual([u.id])
    expect(await runNowForUser(u.id, { registry, now: new Date(now.getTime() + 1_000), scheduleToday: noSchedule })).toEqual({
      status: 'throttled',
    })
    expect(
      (await runNowForUser(u.id, { registry, now: new Date(now.getTime() + RUN_NOW_INTERVAL_MS), scheduleToday: noSchedule })).status,
    ).toBe('ran')
    expect(await statusOf(other.id)).toEqual(['queued'])
  })

  it("queues today's work first, so it works before the daily scheduler has run", async () => {
    const u = await makeUser()
    expect(await statusOf(u.id)).toEqual([])
    const scheduled: string[] = []
    const r = await runNowForUser(u.id, {
      registry,
      now: new Date(),
      scheduleToday: async (userId) => {
        scheduled.push(userId)
        await enqueue('user-task', {}, { userId })
      },
    })
    expect(scheduled).toEqual([u.id])
    expect(r).toMatchObject({ status: 'ran', done: 1 })
  })

  it('uses the real per-user scheduler by default', async () => {
    const u = await makeUser()
    await runNowForUser(u.id, { registry, now: new Date() })
    const types = (await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))).map((j) => j.type)
    expect(types).toContain(JOB_TYPES.followups)
  })
})

describe('getQueueOverview', () => {
  it('counts by status and lists recent failures for the owner only, without internals', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const now = new Date()
    await enqueue(JOB_TYPES.gmailSync, {}, { userId: u.id, runAfter: now })
    await enqueue(JOB_TYPES.digest, {}, { userId: u.id, runAfter: now, maxAttempts: 1 })
    await enqueue(JOB_TYPES.followups, {}, { userId: other.id, runAfter: now, maxAttempts: 1 })
    const claimed = await claim(5, 'w', { now })
    for (const j of claimed) await fail(j, 'w', new Error('Gmail said 500 for x@y.com'), { now })

    const o = await getQueueOverview(u.id)
    expect(o.counts).toEqual({ queued: 0, running: 0, done: 0, failed: 1, dead: 1 })
    expect(o.failures).toHaveLength(2)
    const labels = o.failures.map((f) => f.label).sort()
    expect(labels).toEqual(['Gmail sync', 'Weekly digest'])
    for (const f of o.failures) {
      expect(f.error).toBe('Gmail said 500 for [email]')
      expect(Object.keys(f).sort()).toEqual(
        ['attempts', 'error', 'id', 'label', 'maxAttempts', 'retryAt', 'status', 'updatedAt'].sort(),
      )
    }
    expect(o.failures.find((f) => f.status === 'failed')?.retryAt).toBeInstanceOf(Date)
    expect(o.lastDrainAt).toBeNull()
  })
})
