import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AIProvider } from '@/lib/ai'

// Same seam as queue-parity.test.ts: the discovery handler's AI provider.
const aiHolder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => aiHolder.current,
  getAIProviderForUser: async () => aiHolder.current,
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))

import { db } from '@/lib/db/client'
import { queueJobs, sources } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem } from '@/lib/discovery/adapters/types'
import { readSourceLastResult } from '@/lib/discovery/poll-stats'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { claim, complete, enqueue, fail, LOCK_MS, recoverStale } from '@/lib/queue/queue'
import { createRegistry, defineHandler } from '@/lib/queue/registry'
import { MAX_ATTEMPT_ERRORS, readRunRecord, type JobSummary } from '@/lib/queue/run-summary'
import { getLastRuns, getRunHistory } from '@/lib/queue/runs'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { makeUser } from '@/tests/factories'

const NOW = new Date('2026-09-26T09:00:00Z')
const originalFetch = globalThis.fetch

async function row(id: string) {
  const [r] = await db.select().from(queueJobs).where(eq(queueJobs.id, id))
  if (!r) throw new Error('missing job')
  return r
}

let clock = NOW.getTime()
const tick = (): number => clock

function registryWith(run: () => Promise<{ summary?: JobSummary } | void>) {
  return createRegistry([
    defineHandler({
      type: 'task',
      scope: 'global',
      payload: z.object({}).passthrough(),
      timeoutMs: 5_000,
      async run() {
        clock += 1_234
        return (await run()) ?? {}
      },
    }),
  ])
}

beforeEach(() => {
  clock = NOW.getTime()
})

describe('job run records', () => {
  it('stores start time, duration and the typed summary of a successful run', async () => {
    const id = await enqueue('task', {}, { runAfter: NOW })
    const registry = registryWith(async () => ({ summary: { kind: 'reminders', added: 3 } }))
    await drain({ budgetMs: 60_000, registry, clock: tick })
    const r = await row(id!)
    expect(r.status).toBe('done')
    expect(r.startedAt?.toISOString()).toBe(NOW.toISOString())
    expect(r.durationMs).toBe(1_234)
    expect(readRunRecord(r.result)).toEqual({ summary: { kind: 'reminders', added: 3 }, errors: [] })
  })

  it('keeps each failed attempt’s sanitized error, also after a later success', async () => {
    const id = await enqueue('task', {}, { runAfter: NOW })
    let calls = 0
    const registry = registryWith(async () => {
      calls += 1
      if (calls === 1) throw new Error('Gmail said 500 for jane@example.com token=abc123')
      return { summary: { kind: 'followups', nudged: 2 } }
    })
    await drain({ budgetMs: 60_000, registry, clock: tick, random: () => 0 })
    let r = await row(id!)
    expect(r.status).toBe('failed')
    expect(r.durationMs).toBe(1_234)
    const failed = readRunRecord(r.result)
    expect(failed.errors).toHaveLength(1)
    expect(failed.errors?.[0]).toMatchObject({ attempt: 1, message: 'Gmail said 500 for [email] token=[redacted]' })

    clock += 10 * 60 * 1000
    await db.update(queueJobs).set({ runAfter: new Date(clock) }).where(eq(queueJobs.id, id!))
    await drain({ budgetMs: 60_000, registry, clock: tick })
    r = await row(id!)
    expect(r.status).toBe('done')
    expect(r.lastError).toBeNull()
    const done = readRunRecord(r.result)
    expect(done.summary).toEqual({ kind: 'followups', nudged: 2 })
    expect(done.errors?.map((e) => e.attempt)).toEqual([1])
  })

  it(`keeps only the newest ${MAX_ATTEMPT_ERRORS} attempt errors`, async () => {
    const id = await enqueue('task', {}, { runAfter: NOW, maxAttempts: 3 })
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) {
        const [job] = await claim(1, 'w', { now: new Date(NOW.getTime() + 1e9) })
        await fail(job!, 'w', new Error(`boom ${round}-${i}`), { now: NOW })
      }
      // What Settings' "Retry" does for a dead job (retryDead), minus the owner check.
      await db.update(queueJobs).set({ status: 'queued', attempts: 0 }).where(eq(queueJobs.id, id!))
    }
    const errors = readRunRecord((await row(id!)).result).errors ?? []
    expect(errors).toHaveLength(MAX_ATTEMPT_ERRORS)
    expect(errors.at(-1)?.message).toBe('boom 2-2')
  })

  it('records a stale-lock recovery as a failed attempt', async () => {
    const id = await enqueue('task', {}, { runAfter: NOW })
    await claim(1, 'w', { now: NOW })
    await recoverStale(new Date(NOW.getTime() + LOCK_MS + 1))
    const errors = readRunRecord((await row(id!)).result).errors ?? []
    expect(errors).toEqual([expect.objectContaining({ attempt: 1, message: 'Stopped before finishing; will retry.' })])
  })

  it('caps summary labels before storing them', async () => {
    const id = await enqueue('task', {}, { runAfter: NOW })
    const [job] = await claim(1, 'w', { now: NOW })
    const summary: JobSummary = {
      kind: 'discovery-source',
      source: 'x'.repeat(500),
      status: 'polled',
      fetched: 1,
      new: 1,
      scored: 0,
      quarantined: 0,
      skipped: 0,
      errors: 0,
    }
    await complete(job!.id, 'w', NOW, { durationMs: 5, summary })
    const stored = readRunRecord((await row(id!)).result).summary
    expect(stored?.kind === 'discovery-source' && stored.source.length).toBe(80)
    expect(JSON.stringify((await row(id!)).result).length).toBeLessThan(2048)
  })
})

describe('last runs and history (owner-scoped)', () => {
  it('shows one row per job type with the latest run, global jobs included, other users excluded', async () => {
    const me = await makeUser()
    const other = await makeUser()
    const mine = await enqueue(JOB_TYPES.gmailSync, {}, { userId: me.id, runAfter: NOW })
    const theirs = await enqueue(JOB_TYPES.followups, {}, { userId: other.id, runAfter: NOW })
    const global = await enqueue(JOB_TYPES.reminders, {}, { runAfter: NOW })
    for (let i = 0; i < 3; i++) {
      const [job] = await claim(1, 'w', { now: NOW })
      await complete(job!.id, 'w', NOW, { durationMs: 10, summary: { kind: 'reminders', added: i } })
    }
    const pendingDigest = await enqueue(JOB_TYPES.digest, {}, { userId: me.id, runAfter: new Date(NOW.getTime() + 3_600_000) })
    expect(pendingDigest).not.toBeNull()

    const rows = await getLastRuns(me.id, NOW)
    const byType = new Map(rows.map((r) => [r.type, r]))
    expect(byType.get(JOB_TYPES.gmailSync)?.last?.id).toBe(mine)
    expect(byType.get(JOB_TYPES.reminders)?.last?.id).toBe(global)
    expect(byType.get(JOB_TYPES.reminders)?.last?.mine).toBe(false)
    expect(byType.get(JOB_TYPES.followups)?.last).toBeNull()
    expect(rows.some((r) => r.last?.id === theirs)).toBe(false)
    // Pending digest at 10:00 UTC → first drain after it (12:00 UTC).
    expect(byType.get(JOB_TYPES.digest)?.pending).toBe(true)
    expect(byType.get(JOB_TYPES.digest)?.nextAt.toISOString()).toBe('2026-09-26T12:00:00.000Z')
    // Nothing pending → the drain after the next daily schedule.
    expect(byType.get(JOB_TYPES.followups)?.nextAt.toISOString()).toBe('2026-09-27T12:00:00.000Z')
  })

  it('returns the newest runs of one type, capped', async () => {
    const me = await makeUser()
    for (let i = 0; i < 4; i++) {
      await enqueue(JOB_TYPES.gmailSync, {}, { userId: me.id, runAfter: NOW, idempotencyKey: `k${i}` })
      const [job] = await claim(1, 'w', { now: NOW })
      await complete(job!.id, 'w', new Date(NOW.getTime() + i * 1000), {
        summary: { kind: 'gmail-sync', checked: i, matched: 0, logged: 0 },
      })
    }
    const history = await getRunHistory(me.id, JOB_TYPES.gmailSync, 3)
    expect(history).toHaveLength(3)
    expect(history.every((h) => h.summaryLine.endsWith('0 matched · 0 logged'))).toBe(true)
    expect(await getRunHistory((await makeUser()).id, JOB_TYPES.gmailSync)).toEqual([])
  })
})

describe('real handlers store their summaries', () => {
  function jobItem(i: number): DiscoveryItem {
    return {
      sourceItemId: `gh-${i}`,
      raw: { id: i },
      normalized: {
        kind: 'job',
        title: `Engineer ${i}`,
        companyName: 'Acme',
        companyDomain: 'acme.com',
        remoteType: 'remote',
        employmentType: 'fulltime',
        descriptionMd: 'Build things.',
        applyUrl: `https://boards.greenhouse.io/acme/jobs/${i}`,
        techStack: ['typescript'],
        raw: {},
      },
    }
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nothing', { status: 500 })) as unknown as typeof fetch
    aiHolder.current = new FixtureAIProvider({}) as unknown as AIProvider
  })

  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })

  it('discovery-source: fetched / new / skipped on the job and the source; every type has a summary', async () => {
    const items = [jobItem(1), jobItem(2), jobItem(3)]
    const fake: DiscoveryAdapter = { kind: 'greenhouse', fetch: async () => items }
    vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'greenhouse' ? fake : null))
    const u = await makeUser()
    const src = await sourcesQ.create(u.id, { name: 'Acme board', kind: 'greenhouse', config: { company: 'acme' } })
    // One item was delivered before: it is skipped, not re-inserted.
    await db.execute(
      (await import('drizzle-orm')).sql`insert into discoveries (user_id, source_id, source_job_id, raw, normalized)
        values (${u.id}, ${src.id}, 'gh-1', '{}'::jsonb, '{"kind":"job"}'::jsonb)`,
    )

    await scheduleDailyJobs(new Date())
    await drain({ budgetMs: 60_000, concurrency: 1 })

    const jobs = await db.select().from(queueJobs)
    const poll = jobs.find((j) => j.type === JOB_TYPES.discoverySource)
    expect(poll?.status).toBe('done')
    expect(readRunRecord(poll?.result).summary).toMatchObject({
      kind: 'discovery-source',
      source: 'Acme board',
      status: 'polled',
      fetched: 3,
      new: 2,
      skipped: 1,
      errors: 0,
    })
    for (const j of jobs.filter((x) => x.status === 'done')) {
      expect(readRunRecord(j.result).summary?.kind, j.type).toBeTruthy()
      expect(j.durationMs, j.type).not.toBeNull()
    }
    const [s] = await db.select().from(sources).where(eq(sources.id, src.id))
    expect(readSourceLastResult(s?.lastResult)).toMatchObject({ fetched: 3, new: 2, skipped: 1 })
    const gmail = jobs.find((j) => j.type === JOB_TYPES.gmailSync)
    expect(readRunRecord(gmail?.result).summary).toEqual({ kind: 'gmail-sync', skipped: 'no_google_account' })
  })
})
