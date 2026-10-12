import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, getPgliteClient } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { coalesceKey, COALESCE_RULES } from '@/lib/queue/coalesce'
import { JOB_TYPES, jobKeys } from '@/lib/queue/job-types'
import { claim, enqueue, fail, recoverStale, release, retryDead } from '@/lib/queue/queue'
import { enqueueSourcePolls } from '@/lib/queue/scheduler'
import { makeSource, makeUser } from '@/tests/factories'

/** One pending job per subject (lib/queue/coalesce.ts) and the 0051 backlog cleanup. */

const NOW = new Date('2026-10-12T12:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

const statusOf = async (id: string) => (await db.select().from(queueJobs).where(eq(queueJobs.id, id)))[0]?.status

describe('source polls merge into the pending poll', () => {
  it("a new day's poll for a source with a pending poll adds nothing and pulls it forward", async () => {
    const u = await makeUser()
    const s = await makeSource(u.id)
    const first = await enqueueSourcePolls(u.id, [s.id], new Date(NOW.getTime() - DAY))
    expect(first.created).toBe(1)
    // A failed attempt pushed it to tomorrow.
    await db.update(queueJobs).set({ status: 'failed', runAfter: new Date(NOW.getTime() + DAY) })
    const again = await enqueueSourcePolls(u.id, [s.id], NOW)
    expect(again).toEqual({ created: 0, jobIds: first.jobIds })
    const rows = await db.select().from(queueJobs)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.runAfter.toISOString()).toBe(NOW.toISOString())
  })

  it('a poll already done today is not queued again; another source still is', async () => {
    const u = await makeUser()
    const a = await makeSource(u.id)
    const b = await makeSource(u.id)
    const { jobIds } = await enqueueSourcePolls(u.id, [a.id], NOW)
    await db.update(queueJobs).set({ status: 'done' }).where(inArray(queueJobs.id, jobIds))
    const r = await enqueueSourcePolls(u.id, [a.id, b.id], NOW)
    expect(r.created).toBe(1)
    expect(r.jobIds).toHaveLength(1)
  })

  it('a re-fetch key (per reset) still merges into the pending poll', async () => {
    const u = await makeUser()
    const s = await makeSource(u.id)
    await enqueueSourcePolls(u.id, [s.id], NOW)
    const r = await enqueueSourcePolls(u.id, [s.id], NOW, (id) => `discovery-source:${u.id}:${id}:reset-1`)
    expect(r.created).toBe(0)
    expect(await db.select().from(queueJobs)).toHaveLength(1)
  })
})

describe('daily jobs replace the stale pending one', () => {
  it("today's shortlist supersedes yesterday's unfinished one", async () => {
    const u = await makeUser()
    const old = await enqueue(JOB_TYPES.shortlist, {}, { userId: u.id, idempotencyKey: jobKeys.shortlist(u.id, '2026-10-11') })
    const today = await enqueue(JOB_TYPES.shortlist, {}, { userId: u.id, idempotencyKey: jobKeys.shortlist(u.id, '2026-10-12') })
    expect(today).not.toBeNull()
    expect(await statusOf(old!)).toBe('superseded')
    const [row] = await db.select().from(queueJobs).where(eq(queueJobs.id, old!))
    expect(row?.result).toMatchObject({ superseded: true })
    expect(row?.finishedAt).not.toBeNull()
    // Re-enqueueing today's job is a no-op and never supersedes itself.
    expect(await enqueue(JOB_TYPES.shortlist, {}, { userId: u.id, idempotencyKey: jobKeys.shortlist(u.id, '2026-10-12') })).toBeNull()
    expect(await statusOf(today!)).toBe('queued')
  })

  it('other users, other subjects and uncoalesced types are untouched', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const ka = await enqueue(JOB_TYPES.shortlist, {}, { userId: a.id, idempotencyKey: 'a1' })
    await enqueue(JOB_TYPES.shortlist, {}, { userId: b.id, idempotencyKey: 'b1' })
    const r1 = await enqueue(JOB_TYPES.radarSource, { source: 'hn' }, { userId: a.id, idempotencyKey: 'r1' })
    await enqueue(JOB_TYPES.radarSource, { source: 'arxiv' }, { userId: a.id, idempotencyKey: 'r2' })
    const e1 = await enqueue(JOB_TYPES.companyEnrich, {}, { userId: a.id, idempotencyKey: 'e1' })
    await enqueue(JOB_TYPES.companyEnrich, {}, { userId: a.id, idempotencyKey: 'e2' })
    for (const id of [ka!, r1!, e1!]) expect(await statusOf(id)).toBe('queued')
  })
})

describe('state changes never break one-pending-per-subject', () => {
  async function runningWithPendingSibling() {
    const u = await makeUser()
    const s = await makeSource(u.id)
    const { jobIds } = await enqueueSourcePolls(u.id, [s.id], NOW)
    const [job] = await claim(1, 'w', { now: NOW })
    // While it runs, a new poll is queued for the same source.
    const next = await enqueueSourcePolls(u.id, [s.id], new Date(NOW.getTime() + DAY))
    expect(next.created).toBe(1)
    return { u, job: job!, running: jobIds[0]!, pending: next.jobIds[0]! }
  }

  it('fail → superseded', async () => {
    const { job, running, pending } = await runningWithPendingSibling()
    await fail(job, 'w', new Error('boom'), { now: NOW })
    expect(await statusOf(running)).toBe('superseded')
    expect(await statusOf(pending)).toBe('queued')
  })

  it('release → superseded', async () => {
    const { running } = await runningWithPendingSibling()
    await release(running, 'w', NOW)
    expect(await statusOf(running)).toBe('superseded')
  })

  it('stale-lock recovery → superseded', async () => {
    const { running } = await runningWithPendingSibling()
    expect(await recoverStale(new Date(NOW.getTime() + DAY))).toBeGreaterThan(0)
    expect(await statusOf(running)).toBe('superseded')
  })

  it('retrying a dead job whose source has a pending poll → superseded', async () => {
    const { u, job, running } = await runningWithPendingSibling()
    await fail(job, 'w', new Error('bad'), { now: NOW, permanent: true })
    expect(await statusOf(running)).toBe('dead')
    expect(await retryDead(u.id, running, NOW)).toBe(true)
    expect(await statusOf(running)).toBe('superseded')
  })
})

describe('poll claim order: stalest source first, not oldest job', () => {
  it('never polled, then the oldest last poll; the run_after of the job does not matter', async () => {
    const u = await makeUser()
    const recent = await makeSource(u.id, { lastPolledAt: new Date(NOW.getTime() - HOUR) })
    const stale = await makeSource(u.id, { lastPolledAt: new Date(NOW.getTime() - 3 * DAY) })
    const fresh = await makeSource(u.id)
    // The recently polled source has the oldest job.
    await enqueueSourcePolls(u.id, [recent.id], new Date(NOW.getTime() - 5 * DAY))
    await enqueueSourcePolls(u.id, [stale.id], new Date(NOW.getTime() - 2 * DAY))
    await enqueueSourcePolls(u.id, [fresh.id], NOW)
    const order: unknown[] = []
    for (let i = 0; i < 3; i++) order.push((await claim(1, 'w', { now: NOW }))[0]?.payload.sourceId)
    expect(order).toEqual([fresh.id, stale.id, recent.id])
  })

  it('jobIds limits a claim to exactly those jobs', async () => {
    const u = await makeUser()
    const old = await makeSource(u.id)
    const added = await makeSource(u.id)
    await enqueueSourcePolls(u.id, [old.id], new Date(NOW.getTime() - 3 * DAY))
    const { jobIds } = await enqueueSourcePolls(u.id, [added.id], NOW)
    const [job] = await claim(1, 'w', { now: NOW, jobIds })
    expect(job?.payload.sourceId).toBe(added.id)
    expect(await claim(1, 'w', { now: NOW, jobIds: [] })).toEqual([])
  })
})

/** Statements of migration 0051, run again on rows seeded as they were before it. */
async function runMigration0051(): Promise<void> {
  const text = await readFile(path.resolve(process.cwd(), 'lib/db/migrations/0051_coalesce_source_polls.sql'), 'utf8')
  const pg = getPgliteClient()!
  for (const stmt of text.split(/-->\s*statement-breakpoint\s*/g).map((s) => s.trim()).filter(Boolean)) await pg.exec(stmt)
}

describe('migration 0051: backlog cleanup', () => {
  it('backfills the same keys as lib/queue/coalesce.ts and keeps only the newest pending job per subject', async () => {
    const u = await makeUser()
    const old = await makeSource(u.id, { lastPolledAt: new Date(NOW.getTime() - DAY) })
    const added = await makeSource(u.id)
    await db.execute(sql`drop index queue_jobs_pending_coalesce_uq`)
    try {
      const at = (h: number) => new Date(NOW.getTime() - h * HOUR)
      type Seed = { type: string; userId: string | null; payload?: Record<string, unknown>; status?: string; created: Date; key: string }
      const seeds: Seed[] = [
        // Daily polls piled up for both sources; one is retrying.
        { type: JOB_TYPES.discoverySource, userId: u.id, payload: { sourceId: old.id }, created: at(72), key: 'p1' },
        { type: JOB_TYPES.discoverySource, userId: u.id, payload: { sourceId: old.id }, created: at(48), key: 'p2', status: 'failed' },
        { type: JOB_TYPES.discoverySource, userId: u.id, payload: { sourceId: old.id }, created: at(24), key: 'p3' },
        { type: JOB_TYPES.discoverySource, userId: u.id, payload: { sourceId: added.id }, created: at(50), key: 'p4' },
        { type: JOB_TYPES.discoverySource, userId: u.id, payload: { sourceId: added.id }, created: at(2), key: 'p5' },
        // The chain stuck since Oct 9.
        ...[72, 48, 24].flatMap((h, i): Seed[] => [
          { type: JOB_TYPES.scamReassess, userId: u.id, created: at(h), key: `s${i}` },
          { type: JOB_TYPES.shortlist, userId: u.id, created: at(h), key: `l${i}` },
          { type: JOB_TYPES.discoveryEmail, userId: u.id, created: at(h), key: `e${i}` },
        ]),
        { type: JOB_TYPES.radarSource, userId: u.id, payload: { source: 'hn' }, created: at(72), key: 'r1' },
        { type: JOB_TYPES.radarSource, userId: u.id, payload: { source: 'hn' }, created: at(48), key: 'r2' },
        { type: JOB_TYPES.radarSource, userId: u.id, payload: { source: 'arxiv' }, created: at(48), key: 'r3' },
        { type: JOB_TYPES.radarNew, userId: null, payload: { source: 'hn' }, created: at(72), key: 'n1' },
        { type: JOB_TYPES.radarNew, userId: null, payload: { source: 'hn' }, created: at(48), key: 'n2' },
        { type: JOB_TYPES.companyReputation, userId: u.id, payload: { companyId: '00000000-0000-4000-8000-000000000001' }, created: at(72), key: 'c1' },
        { type: JOB_TYPES.companyReputation, userId: u.id, payload: { companyId: '00000000-0000-4000-8000-000000000001' }, created: at(24), key: 'c2' },
        { type: JOB_TYPES.companyReputation, userId: u.id, payload: { companyId: '00000000-0000-4000-8000-000000000002' }, created: at(24), key: 'c3' },
        { type: JOB_TYPES.companyDiscovery, userId: u.id, payload: { trigger: 'weekly' }, created: at(60), key: 'd1' },
        { type: JOB_TYPES.companyDiscovery, userId: u.id, payload: { trigger: 'manual' }, created: at(10), key: 'd2' },
        { type: JOB_TYPES.reminders, userId: null, created: at(48), key: 'm1' },
        { type: JOB_TYPES.reminders, userId: null, created: at(24), key: 'm2' },
        // Finished and uncoalesced jobs are left alone.
        { type: JOB_TYPES.shortlist, userId: u.id, created: at(96), key: 'done', status: 'done' },
        { type: JOB_TYPES.companyEnrich, userId: u.id, created: at(72), key: 'x1' },
        { type: JOB_TYPES.companyEnrich, userId: u.id, created: at(24), key: 'x2' },
      ]
      await db.insert(queueJobs).values(
        seeds.map((s) => ({
          type: s.type,
          userId: s.userId,
          payload: s.payload ?? {},
          status: s.status ?? 'queued',
          createdAt: s.created,
          runAfter: s.created,
          idempotencyKey: s.key,
        })),
      )
      await runMigration0051()
    } finally {
      // The migration recreates it; make sure later tests always have it.
      await db.execute(sql`create unique index if not exists queue_jobs_pending_coalesce_uq on queue_jobs (type, coalesce_key) where status in ('queued', 'failed') and coalesce_key is not null`)
    }

    const rows = await db.select().from(queueJobs)
    const byKey = new Map(rows.map((r) => [r.idempotencyKey, r]))
    // The SQL backfill matches the TS rule for every coalesced pending row.
    for (const r of rows.filter((x) => x.status !== 'done' && COALESCE_RULES[x.type])) {
      expect(r.coalesceKey, r.idempotencyKey ?? '').toBe(coalesceKey(r.type, r.userId, r.payload as Record<string, unknown>))
    }
    const kept = rows.filter((r) => r.status === 'queued' || r.status === 'failed').map((r) => r.idempotencyKey).sort()
    expect(kept).toEqual(['c2', 'c3', 'd2', 'e2', 'l2', 'm2', 'n2', 'p3', 'p5', 'r2', 'r3', 's2', 'x1', 'x2'])
    const superseded = rows.filter((r) => r.status === 'superseded')
    expect(superseded.map((r) => r.idempotencyKey).sort()).toEqual(
      ['c1', 'd1', 'e0', 'e1', 'l0', 'l1', 'm1', 'n1', 'p1', 'p2', 'p4', 'r1', 's0', 's1'].sort(),
    )
    expect(superseded.every((r) => r.finishedAt !== null && (r.result as { superseded?: boolean }).superseded === true)).toBe(true)
    expect(byKey.get('done')?.status).toBe('done')
    // New sources' polls are first in line afterwards.
    const [first] = await claim(1, 'w', { now: NOW, types: [JOB_TYPES.discoverySource] })
    expect(first?.payload.sourceId).toBe(added.id)
  })
})
