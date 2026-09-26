import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import {
  claim,
  complete,
  enqueue,
  enqueueMany,
  fail,
  LOCK_MS,
  recoverStale,
  release,
  retryDead,
} from '@/lib/queue/queue'
import { drain } from '@/lib/queue/drain'
import { createRegistry, defineHandler } from '@/lib/queue/registry'
import { BACKOFF_BASE_MS } from '@/lib/queue/backoff'
import { makeUser } from '@/tests/factories'

async function row(id: string) {
  const [r] = await db.select().from(queueJobs).where(eq(queueJobs.id, id))
  if (!r) throw new Error('missing job')
  return r
}

const NOW = new Date('2026-09-26T09:00:00Z')

describe('enqueue', () => {
  it('is idempotent per (type, idempotency key)', async () => {
    const u = await makeUser()
    const a = await enqueue('t', { x: 1 }, { userId: u.id, idempotencyKey: 'k1' })
    const b = await enqueue('t', { x: 2 }, { userId: u.id, idempotencyKey: 'k1' })
    const c = await enqueue('other', {}, { userId: u.id, idempotencyKey: 'k1' })
    expect(a).not.toBeNull()
    expect(b).toBeNull()
    expect(c).not.toBeNull()
    expect((await row(a!)).payload).toEqual({ x: 1 })
  })

  it('enqueueMany counts only new rows; keyless jobs never conflict', async () => {
    const first = await enqueueMany([
      { type: 't', idempotencyKey: 'a' },
      { type: 't', idempotencyKey: 'b' },
      { type: 't' },
    ])
    const second = await enqueueMany([{ type: 't', idempotencyKey: 'a' }, { type: 't' }])
    expect(first.created).toBe(3)
    expect(second.created).toBe(1)
  })

  it('stays idempotent after the job is done', async () => {
    const id = await enqueue('t', {}, { idempotencyKey: 'done-key', runAfter: NOW })
    const [job] = await claim(1, 'w', { now: NOW })
    await complete(job!.id, 'w', NOW)
    expect(await enqueue('t', {}, { idempotencyKey: 'done-key' })).toBeNull()
    expect((await row(id!)).status).toBe('done')
  })
})

describe('claim', () => {
  it('claims due jobs by priority, marks them running and counts the attempt', async () => {
    await enqueue('late', {}, { runAfter: new Date(NOW.getTime() + 60_000), priority: 0 })
    const low = await enqueue('low', {}, { runAfter: NOW, priority: 50 })
    const high = await enqueue('high', {}, { runAfter: NOW, priority: 1 })
    const jobs = await claim(5, 'w1', { now: NOW })
    expect(jobs.map((j) => j.id)).toEqual([high, low])
    const r = await row(high!)
    expect(r.status).toBe('running')
    expect(r.attempts).toBe(1)
    expect(r.lockedBy).toBe('w1')
    expect(r.lockedUntil!.getTime()).toBe(NOW.getTime() + LOCK_MS)
  })

  it('never hands the same job to two concurrent claimers', async () => {
    await enqueueMany(Array.from({ length: 6 }, () => ({ type: 't', runAfter: NOW })))
    const [a, b, c] = await Promise.all([
      claim(3, 'a', { now: NOW }),
      claim(3, 'b', { now: NOW }),
      claim(3, 'c', { now: NOW }),
    ])
    const ids = [...a!, ...b!, ...c!].map((j) => j.id)
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(6)
  })

  it('filters by user and type', async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    await enqueue('x', {}, { userId: u1.id, runAfter: NOW })
    const mine = await enqueue('y', {}, { userId: u2.id, runAfter: NOW })
    await enqueue('x', {}, { userId: u2.id, runAfter: NOW })
    const jobs = await claim(5, 'w', { now: NOW, userId: u2.id, types: ['y'] })
    expect(jobs.map((j) => j.id)).toEqual([mine])
  })

  it('holds a job while an unfinished job of its wait_for_type exists for the same user', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const poll = await enqueue('poll', {}, { userId: u.id, runAfter: NOW, priority: 5 })
    await enqueue('poll', {}, { userId: other.id, runAfter: NOW, priority: 5 })
    const email = await enqueue('email', {}, { userId: u.id, runAfter: NOW, priority: 1, waitForType: 'poll' })
    const first = await claim(10, 'w', { now: NOW, userId: u.id })
    expect(first.map((j) => j.id)).toEqual([poll])
    expect(await claim(10, 'w', { now: NOW, userId: u.id })).toEqual([])
    await complete(poll!, 'w', NOW)
    const second = await claim(10, 'w', { now: NOW, userId: u.id })
    expect(second.map((j) => j.id)).toEqual([email])
  })

  it('a dead dependency unblocks its waiter (old sync-all sent the email even when a poll failed)', async () => {
    const u = await makeUser()
    await enqueue('poll', {}, { userId: u.id, runAfter: NOW, priority: 5, maxAttempts: 1 })
    const email = await enqueue('email', {}, { userId: u.id, runAfter: NOW, priority: 1, waitForType: 'poll' })
    const [poll] = await claim(1, 'w', { now: NOW, userId: u.id })
    expect((await fail(poll!, 'w', new Error('x'), { now: NOW })).status).toBe('dead')
    expect((await claim(10, 'w', { now: NOW, userId: u.id })).map((j) => j.id)).toEqual([email])
  })
})

describe('complete / fail / release', () => {
  it('fail schedules a jittered exponential retry, then dead at max_attempts', async () => {
    const id = await enqueue('t', {}, { runAfter: NOW, maxAttempts: 2 })
    const [j1] = await claim(1, 'w', { now: NOW })
    const f1 = await fail(j1!, 'w', new Error('upstream 500'), { now: NOW, random: () => 0 })
    expect(f1.status).toBe('failed')
    let r = await row(id!)
    expect(r.status).toBe('failed')
    expect(r.lastError).toBe('upstream 500')
    expect(r.runAfter.getTime()).toBe(NOW.getTime() + BACKOFF_BASE_MS / 2)
    expect(await claim(1, 'w', { now: NOW })).toEqual([])

    const later = new Date(NOW.getTime() + BACKOFF_BASE_MS)
    const [j2] = await claim(1, 'w', { now: later })
    expect(j2!.attempts).toBe(2)
    const f2 = await fail(j2!, 'w', new Error('again'), { now: later })
    expect(f2.status).toBe('dead')
    r = await row(id!)
    expect(r.status).toBe('dead')
    expect(r.finishedAt).not.toBeNull()
    expect(r.lockedBy).toBeNull()
  })

  it('permanent errors go straight to dead', async () => {
    await enqueue('t', {}, { runAfter: NOW })
    const [j] = await claim(1, 'w', { now: NOW })
    expect((await fail(j!, 'w', new Error('bad'), { now: NOW, permanent: true })).status).toBe('dead')
  })

  it('a worker that lost its lock cannot complete or fail the job', async () => {
    const id = await enqueue('t', {}, { runAfter: NOW })
    await claim(1, 'w1', { now: NOW })
    expect(await complete(id!, 'w2', NOW)).toBe(false)
    expect((await fail({ id: id!, attempts: 1, maxAttempts: 5 }, 'w2', 'x', { now: NOW })).owned).toBe(false)
    expect((await row(id!)).status).toBe('running')
  })

  it('release hands the job back and refunds the attempt', async () => {
    const id = await enqueue('t', {}, { runAfter: NOW })
    await claim(1, 'w', { now: NOW })
    expect(await release(id!, 'w', NOW)).toBe(true)
    const r = await row(id!)
    expect(r.status).toBe('queued')
    expect(r.attempts).toBe(0)
  })
})

describe('recoverStale', () => {
  it('requeues running jobs past locked_until, or kills them when attempts are spent', async () => {
    const a = await enqueue('t', {}, { runAfter: NOW, maxAttempts: 3 })
    const b = await enqueue('t', {}, { runAfter: NOW, maxAttempts: 1 })
    await claim(2, 'w', { now: NOW })
    expect(await recoverStale(new Date(NOW.getTime() + 1_000))).toBe(0)
    const after = new Date(NOW.getTime() + LOCK_MS + 1_000)
    expect(await recoverStale(after)).toBe(2)
    expect((await row(a!)).status).toBe('queued')
    expect((await row(a!)).lockedBy).toBeNull()
    expect((await row(b!)).status).toBe('dead')
  })
})

describe('retryDead', () => {
  it('is owner-scoped and only for dead jobs', async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const id = await enqueue('t', {}, { userId: owner.id, runAfter: NOW, maxAttempts: 1 })
    const [j] = await claim(1, 'w', { now: NOW })
    await fail(j!, 'w', 'x', { now: NOW })
    expect(await retryDead(stranger.id, id!)).toBe(false)
    expect(await retryDead(owner.id, id!)).toBe(true)
    const r = await row(id!)
    expect(r.status).toBe('queued')
    expect(r.attempts).toBe(0)
    expect(await retryDead(owner.id, id!)).toBe(false)
  })
})

describe('drain', () => {
  const calls: string[] = []
  const registry = createRegistry([
    defineHandler({
      type: 'ok',
      scope: 'global',
      payload: z.object({ n: z.number() }),
      timeoutMs: 5_000,
      async run({ payload }) {
        calls.push(`ok:${payload.n}`)
        return { metrics: { things: payload.n }, warnings: payload.n === 2 ? ['minor issue'] : [] }
      },
    }),
    defineHandler({
      type: 'boom',
      scope: 'global',
      payload: z.object({}),
      timeoutMs: 5_000,
      async run() {
        throw new Error('kaput token=abc')
      },
    }),
    defineHandler({
      type: 'slow',
      scope: 'global',
      payload: z.object({}),
      timeoutMs: 50,
      async run({ signal }) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        calls.push(`slow-finished-aborted:${signal.aborted}`)
      },
    }),
    defineHandler({
      type: 'needs-user',
      scope: 'user',
      payload: z.object({}),
      timeoutMs: 5_000,
      async run() {},
    }),
  ])

  it('runs due jobs, sums metrics, fails and times out per job', async () => {
    calls.length = 0
    await enqueue('ok', { n: 1 })
    await enqueue('ok', { n: 2 })
    const boom = await enqueue('boom', {})
    const slow = await enqueue('slow', {})
    const r = await drain({ budgetMs: 10_000, registry, concurrency: 2 })
    expect(r.done).toBe(2)
    expect(r.failed).toBe(2)
    expect(r.metrics).toEqual({ things: 3 })
    expect(r.stoppedBy).toBe('empty')
    expect(r.errors.some((e) => e.startsWith('ok: minor issue'))).toBe(true)
    expect(r.errors.some((e) => e.includes('kaput') && !e.includes('abc'))).toBe(true)
    expect((await row(boom!)).status).toBe('failed')
    const s = await row(slow!)
    expect(s.status).toBe('failed')
    expect(s.lastError).toMatch(/Timed out/)
  })

  it('marks unknown types, bad payloads and missing users dead without retry', async () => {
    const unknown = await enqueue('nope', {})
    const bad = await enqueue('ok', { n: 'x' })
    const noUser = await enqueue('needs-user', {})
    const r = await drain({ budgetMs: 10_000, registry })
    expect(r.dead).toBe(3)
    for (const id of [unknown, bad, noUser]) expect((await row(id!)).status).toBe('dead')
  })

  it('stops at maxJobs', async () => {
    for (let n = 0; n < 5; n++) await enqueue('ok', { n })
    const r = await drain({ budgetMs: 10_000, registry, maxJobs: 3 })
    expect(r.done).toBe(3)
    expect(r.stoppedBy).toBe('max_jobs')
  })

  it('stops starting jobs once the budget is nearly spent', async () => {
    for (let n = 0; n < 3; n++) await enqueue('ok', { n })
    let t = Date.now() + 1_000
    // Every clock read advances 400 ms; budget 2 s with a 1 s stop margin.
    const r = await drain({ budgetMs: 2_000, registry, clock: () => (t += 400) })
    expect(r.stoppedBy).toBe('budget')
    expect(r.done).toBeLessThan(3)
    const left = await db.select().from(queueJobs).where(eq(queueJobs.status, 'queued'))
    expect(left.length).toBe(3 - r.done)
  })

  it('releases a claimed job untouched when the budget left is below its minimum', async () => {
    const reg = createRegistry([
      defineHandler({
        type: 'big',
        scope: 'global',
        payload: z.object({}),
        timeoutMs: 60_000,
        minBudgetMs: 30_000,
        async run() {},
      }),
    ])
    const id = await enqueue('big', {})
    const r = await drain({ budgetMs: 20_000, registry: reg })
    expect(r.released).toBe(1)
    expect(r.stoppedBy).toBe('budget')
    const j = await row(id!)
    expect(j.status).toBe('queued')
    expect(j.attempts).toBe(0)
  })

  it('recovers stale locks before claiming', async () => {
    const id = await enqueue('ok', { n: 7 }, { runAfter: new Date(Date.now() - LOCK_MS * 2) })
    await claim(1, 'dead-worker', { now: new Date(Date.now() - LOCK_MS * 2) })
    const r = await drain({ budgetMs: 10_000, registry })
    expect(r.recovered).toBe(1)
    expect((await row(id!)).status).toBe('done')
  })
})
