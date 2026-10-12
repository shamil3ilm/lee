import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, sources, users } from '@/lib/db/schema'
import { drain } from '@/lib/queue/drain'
import { createRegistry, defineHandler, type HandlerRegistry } from '@/lib/queue/registry'
import { JOB_TYPES, utcDay } from '@/lib/queue/job-types'
import { enqueueMany } from '@/lib/queue/queue'
import { planUserJobs, scheduleDailyJobs } from '@/lib/queue/scheduler'
import { queueFirstPoll } from '@/lib/queue/first-poll'
import { CRON_DRAIN_BUDGET_MS, CRON_DRAIN_CONCURRENCY } from '@/lib/queue/cron'
import { makeSource, makeUser } from '@/tests/factories'

/**
 * Production incident (Oct 12): sources added on Oct 10 and Oct 12 were
 * enabled but never polled. Every day queued a poll for every source, the
 * cron drains finished only part of it, and claims worked through the
 * oldest backlog first, so a new source's poll sat behind it indefinitely.
 *
 * This replays that timeline through the real enqueue, scheduler and drain
 * code with a fake clock: each poll costs POLL_MS of drain time.
 */

const POLL_MS = 20_000
const DAY = 86_400_000
const at = (iso: string) => new Date(iso)

/** Stub handlers for every job type; a poll stamps the source like the real one. */
function stubRegistry(clock: { t: number }, polled: string[]): HandlerRegistry {
  return createRegistry(
    Object.values(JOB_TYPES).map((type) =>
      defineHandler({
        type,
        scope: type.endsWith(':all') || type === JOB_TYPES.radarNew ? 'global' : 'user',
        payload: z.object({}).passthrough(),
        timeoutMs: 120_000,
        minBudgetMs: type === JOB_TYPES.discoverySource ? 20_000 : 1,
        async run({ payload }) {
          if (type === JOB_TYPES.discoverySource) {
            const sourceId = String(payload.sourceId)
            clock.t += POLL_MS
            polled.push(sourceId)
            await db.update(sources).set({ lastPolledAt: new Date(clock.t) }).where(eq(sources.id, sourceId))
          } else {
            clock.t += 1_000
          }
          return {}
        },
      }),
    ),
  )
}

async function cronDrainAt(iso: string, registry: HandlerRegistry, clock: { t: number }) {
  clock.t = at(iso).getTime()
  return drain({ budgetMs: CRON_DRAIN_BUDGET_MS, concurrency: CRON_DRAIN_CONCURRENCY, registry, clock: () => clock.t })
}

async function pendingPolls(userId: string) {
  return db
    .select({ id: queueJobs.id, payload: queueJobs.payload })
    .from(queueJobs)
    .where(and(eq(queueJobs.userId, userId), eq(queueJobs.type, JOB_TYPES.discoverySource), inArray(queueJobs.status, ['queued', 'failed'])))
}

describe('discovery poll starvation (production replay)', () => {
  it('a source added during a poll backlog is polled at the next drain', async () => {
    const u = await makeUser()
    await db.update(users).set({ lastSeenAt: at('2026-10-12T08:00:00Z') }).where(eq(users.id, u.id))
    // 40 older sources, last polled on Oct 8.
    const old = []
    for (let i = 0; i < 40; i++) {
      old.push(await makeSource(u.id, { name: `Old ${i}`, kind: 'greenhouse', config: { company: `old${i}` }, lastPolledAt: at('2026-10-08T12:00:00Z') }))
    }
    const oldIds = old.map((s) => s.id)
    // The old daily plan queued every source every day (Oct 9, 10, 11); the drains never caught up.
    for (const day of ['2026-10-09', '2026-10-10', '2026-10-11']) {
      const now = at(`${day}T09:48:00Z`)
      await enqueueMany(planUserJobs(u.id, oldIds, utcDay(now), now))
    }
    // Five sources added on Oct 10 (first poll queued), polled by nobody since.
    const added = []
    for (let i = 0; i < 5; i++) {
      const s = await makeSource(u.id, { name: `New ${i}`, kind: 'greenhouse', config: { company: `new${i}` } })
      await queueFirstPoll(u.id, s.id, at('2026-10-10T09:48:00Z'))
      added.push(s.id)
    }

    // Oct 12: the daily scheduler, then the first cron drain.
    await scheduleDailyJobs(at('2026-10-12T09:48:00Z'))
    // One pending poll per source, never a pile of days.
    const pending = await pendingPolls(u.id)
    const perSource = new Map<string, number>()
    for (const p of pending) {
      const id = String((p.payload as { sourceId: string }).sourceId)
      perSource.set(id, (perSource.get(id) ?? 0) + 1)
    }
    expect(Math.max(...perSource.values())).toBe(1)
    expect(pending.length).toBeLessThanOrEqual(oldIds.length + added.length)

    const clock = { t: 0 }
    const polled: string[] = []
    const registry = stubRegistry(clock, polled)
    await cronDrainAt('2026-10-12T12:00:00Z', registry, clock)

    // Every new source was polled in that one drain.
    const never = await db
      .select({ id: sources.id })
      .from(sources)
      .where(and(inArray(sources.id, added), isNull(sources.lastPolledAt)))
    expect(never).toEqual([])
    expect(new Set(polled).size).toBe(polled.length) // no source polled twice in a drain
  })

  it("yesterday's unfinished poll does not block today's Scam Shield → shortlist → email chain", async () => {
    const u = await makeUser()
    const s = await makeSource(u.id, { kind: 'greenhouse', config: { company: 'x' } })
    const yesterday = at('2026-10-11T09:48:00Z')
    const today = at('2026-10-12T09:48:00Z')
    // A poll from yesterday still queued, but not due yet (e.g. waiting to retry).
    await db.insert(queueJobs).values({
      userId: u.id,
      type: JOB_TYPES.discoverySource,
      payload: { sourceId: s.id },
      status: 'failed',
      runAfter: new Date(today.getTime() + DAY),
      idempotencyKey: `discovery-source:${u.id}:${s.id}:2026-10-11`,
      createdAt: yesterday,
      priority: 40,
    })
    // Today's chain, without polls (all sources were planned elsewhere).
    await enqueueMany(planUserJobs(u.id, [], utcDay(today), today).filter((j) => j.type !== JOB_TYPES.discoverySource))

    const clock = { t: 0 }
    const registry = stubRegistry(clock, [])
    await cronDrainAt('2026-10-12T12:00:00Z', registry, clock)
    const chain = await db
      .select({ type: queueJobs.type, status: queueJobs.status })
      .from(queueJobs)
      .where(and(eq(queueJobs.userId, u.id), inArray(queueJobs.type, [JOB_TYPES.scamReassess, JOB_TYPES.shortlist, JOB_TYPES.discoveryEmail])))
    expect(chain).toHaveLength(3)
    expect(chain.every((j) => j.status === 'done')).toBe(true)
  })

  it("today's chain still waits for today's polls", async () => {
    const u = await makeUser()
    const s = await makeSource(u.id, { kind: 'greenhouse', config: { company: 'x' } })
    const today = at('2026-10-12T09:48:00Z')
    await enqueueMany(planUserJobs(u.id, [s.id], utcDay(today), today))
    // Make today's poll not due before the drain.
    await db
      .update(queueJobs)
      .set({ runAfter: at('2026-10-12T13:00:00Z') })
      .where(eq(queueJobs.type, JOB_TYPES.discoverySource))
    const clock = { t: 0 }
    await cronDrainAt('2026-10-12T12:00:00Z', stubRegistry(clock, []), clock)
    const [scam] = await db.select({ status: queueJobs.status }).from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.scamReassess))
    expect(scam?.status).toBe('queued')
  })

  it('a dependent job never waits forever: past the wait limit it runs anyway', async () => {
    const u = await makeUser()
    const s = await makeSource(u.id, { kind: 'greenhouse', config: { company: 'x' } })
    const today = at('2026-10-12T09:48:00Z')
    await enqueueMany(planUserJobs(u.id, [s.id], utcDay(today), today))
    // Today's poll keeps failing with a retry far away.
    await db
      .update(queueJobs)
      .set({ status: 'failed', runAfter: at('2026-10-13T08:00:00Z') })
      .where(eq(queueJobs.type, JOB_TYPES.discoverySource))
    const clock = { t: 0 }
    await cronDrainAt('2026-10-12T21:00:00Z', stubRegistry(clock, []), clock)
    const [scam] = await db.select({ status: queueJobs.status }).from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.scamReassess))
    expect(scam?.status).toBe('done')
  })
})
