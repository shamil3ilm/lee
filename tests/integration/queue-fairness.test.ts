import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, users } from '@/lib/db/schema'
import { claim, enqueue } from '@/lib/queue/queue'
import { drain } from '@/lib/queue/drain'
import { createRegistry, defineHandler } from '@/lib/queue/registry'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { scheduleDailyJobs, scheduleUserToday } from '@/lib/queue/scheduler'
import { touchLastSeen, wasDormant } from '@/lib/queue/visit'
import { makeGoogleAccount, makeOwner, makeSource, makeUser } from '@/tests/factories'

/**
 * Fair, budgeted queue (lib/queue/capacity.ts): round-robin claims,
 * per-user drain time slices, dormant users skipped, Gmail jobs only for
 * the owner, and activity stamped by visits.
 */

const NOW = new Date('2026-10-12T09:00:00Z')
const DAY = 86_400_000

describe('claim order', () => {
  it('round-robin across users: every user’s first job before anyone’s second', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const c = await makeUser()
    for (let i = 0; i < 4; i++) await enqueue('test:poll', {}, { userId: a.id, runAfter: new Date(NOW.getTime() - 10_000 + i), priority: 40 })
    await enqueue('test:poll', {}, { userId: b.id, runAfter: NOW, priority: 40 })
    await enqueue('test:poll', {}, { userId: c.id, runAfter: NOW, priority: 40 })
    const first = await claim(3, 'w', { now: NOW })
    expect(first.map((j) => j.userId).sort()).toEqual([a.id, b.id, c.id].sort())
    const next = await claim(3, 'w', { now: NOW })
    expect(next.map((j) => j.userId)).toEqual([a.id, a.id, a.id])
  })

  it('priority still comes first, and excluded users are skipped', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await enqueue('test:late', {}, { userId: a.id, runAfter: NOW, priority: 50 })
    await enqueue('test:early', {}, { userId: b.id, runAfter: NOW, priority: 10 })
    expect((await claim(1, 'w', { now: NOW, excludeUserIds: [b.id] }))[0]?.type).toBe('test:late')
    expect((await claim(1, 'w', { now: NOW }))[0]?.type).toBe('test:early')
  })
})

describe('time-sliced drain', () => {
  it('a user past their slice waits while others have work; the drain never idles', async () => {
    const heavy = await makeUser()
    const light = await makeUser()
    // Heavy's jobs outrank light's, so without slices heavy would run all four first.
    for (let i = 0; i < 4; i++) await enqueue('test:work', { n: i }, { userId: heavy.id, runAfter: new Date(NOW.getTime() + i), priority: 40 })
    for (let i = 0; i < 2; i++) await enqueue('test:work', { n: i }, { userId: light.id, runAfter: new Date(NOW.getTime() + i), priority: 41 })
    let clock = NOW.getTime() + 1_000
    const order: string[] = []
    const registry = createRegistry([
      defineHandler({
        type: 'test:work',
        scope: 'user',
        payload: z.object({ n: z.number() }).passthrough(),
        timeoutMs: 120_000,
        minBudgetMs: 1,
        async run({ job }) {
          order.push(job.userId === heavy.id ? 'H' : 'L')
          clock += 30_000
          return {}
        },
      }),
    ])
    const r = await drain({ budgetMs: 600_000, concurrency: 1, registry, clock: () => clock, userSliceMs: 60_000 })
    expect(r.done).toBe(6)
    // Two heavy jobs use the 60 s slice; light runs; heavy finishes once light is done.
    expect(order.join('')).toBe('HHLLHH')
  })
})

describe('daily scheduler on the capacity plan', () => {
  it('skips dormant accounts; plans Gmail jobs and email-alert sources for the owner only', async () => {
    const owner = await makeOwner()
    const member = await makeUser()
    // Even a member with a stray Gmail grant gets no Gmail jobs (owner-only in the beta).
    await makeGoogleAccount(member.id)
    const dormant = await makeUser()
    await db.update(users).set({ lastSeenAt: new Date(NOW.getTime() - 30 * DAY) }).where(eq(users.id, dormant.id))
    await db.update(users).set({ lastSeenAt: NOW }).where(eq(users.id, owner.id))
    await db.update(users).set({ lastSeenAt: NOW }).where(eq(users.id, member.id))
    for (const u of [owner, member, dormant]) {
      await makeSource(u.id, { name: 'Board', kind: 'greenhouse', config: { company: 'x' } })
      await makeSource(u.id, { name: 'Alerts', kind: 'email_alert', config: {} })
    }

    const r = await scheduleDailyJobs(NOW)
    expect(r).toMatchObject({ users: 3, dormant: 1 })
    const jobs = await db.select().from(queueJobs)
    const of = (id: string) => jobs.filter((j) => j.userId === id).map((j) => j.type)
    expect(of(dormant.id)).toEqual([])
    expect(of(member.id)).not.toContain(JOB_TYPES.gmailSync)
    expect(of(member.id)).not.toContain(JOB_TYPES.digest)
    expect(of(member.id)).not.toContain(JOB_TYPES.discoveryEmail)
    expect(of(member.id).filter((t) => t === JOB_TYPES.discoverySource)).toHaveLength(1) // not the Gmail alerts source
    expect(of(owner.id)).toEqual(expect.arrayContaining([JOB_TYPES.gmailSync, JOB_TYPES.digest, JOB_TYPES.discoveryEmail]))
    expect(of(owner.id).filter((t) => t === JOB_TYPES.discoverySource)).toHaveLength(2)
    expect(of(member.id)).toContain(JOB_TYPES.discoveryBenefits)
  })

  it('a suspended account gets nothing', async () => {
    const u = await makeUser()
    await makeSource(u.id, { kind: 'greenhouse', config: { company: 'x' } })
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, u.id))
    await scheduleDailyJobs(NOW)
    expect(await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))).toEqual([])
  })

  it('Run now plans the user at an active share', async () => {
    const u = await makeUser()
    for (let i = 0; i < 3; i++) await makeSource(u.id, { kind: 'greenhouse', config: { company: `c${i}` } })
    const r = await scheduleUserToday(u.id, NOW)
    expect(r.enqueued).toBeGreaterThan(3)
    const polls = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.discoverySource))
    expect(polls).toHaveLength(3)
  })
})

describe('activity', () => {
  it('stamps the last visit at most hourly and reports the previous one', async () => {
    const u = await makeUser()
    await db.update(users).set({ lastSeenAt: new Date(NOW.getTime() - 20 * DAY) }).where(eq(users.id, u.id))
    const prev = await touchLastSeen(u.id, NOW)
    expect(prev?.toISOString()).toBe(new Date(NOW.getTime() - 20 * DAY).toISOString())
    expect(wasDormant(prev, NOW)).toBe(true)
    // Within the hour: no write.
    expect(await touchLastSeen(u.id, new Date(NOW.getTime() + 10 * 60_000))).toBeUndefined()
    const later = new Date(NOW.getTime() + 2 * 3_600_000)
    const again = await touchLastSeen(u.id, later)
    expect(again?.toISOString()).toBe(NOW.toISOString())
    expect(wasDormant(again, later)).toBe(false)
    expect(wasDormant(null, later)).toBe(false)
  })
})
