import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import type { AIProvider } from '@/lib/ai'

// The discovery-source handler asks `getAIProviderForUser` for a provider;
// hand it the test's fixture provider. The full module surface is mocked so
// nothing under lib/ai (the Google SDK) loads — see cron-sync-all.test.ts.
const aiHolder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => aiHolder.current,
  getAIProviderForUser: async () => aiHolder.current,
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))

import { db } from '@/lib/db/client'
import { activities, discoveries, queueJobs, sources } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as weekly from '@/lib/digest/weekly'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem } from '@/lib/discovery/adapters/types'
import { MAX_SCORED_PER_SOURCE } from '@/lib/discovery/service'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

/**
 * Behaviour parity: the queue pipeline (scheduler → drain) has the same
 * effects as the old monolithic sync-all. The old route's own tests
 * (tests/unit/cron-sync-all.test.ts) also still pass against the alias.
 */

const DAY = 24 * 60 * 60 * 1000
const originalFetch = globalThis.fetch

async function runDay(now: Date = new Date()) {
  await scheduleDailyJobs(now)
  return drain({ budgetMs: 60_000, concurrency: 2 })
}

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

function stubGreenhouse(items: DiscoveryItem[], delayMs = 0): void {
  const fake: DiscoveryAdapter = {
    kind: 'greenhouse',
    async fetch() {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      return items
    },
  }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'greenhouse' ? fake : null))
}

const scoreResult = {
  match_score: 70,
  strengths: [],
  red_flags: [],
  reasoning: '',
  location_match: 'remote' as const,
  seniority_match: 'match' as const,
  stack_overlap: [],
  stack_gaps: [],
  industry_match: 'weak' as const,
}

beforeEach(() => {
  vi.restoreAllMocks()
  // Anything reaching the network (hn adapter, Gmail) gets a 500.
  ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response('nothing', { status: 500 })) as unknown as typeof fetch
  aiHolder.current = new FixtureAIProvider({ scoreJob: () => scoreResult }) as unknown as AIProvider
})

afterEach(() => {
  ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  vi.useRealTimers()
})

describe('scheduler', () => {
  it("plans the day's jobs once per UTC day, one discovery job per active source", async () => {
    const u = await makeUser()
    await sourcesQ.create(u.id, { name: 'A', kind: 'greenhouse', config: { company: 'a' } })
    await sourcesQ.create(u.id, { name: 'B', kind: 'greenhouse', config: { company: 'b' } })
    const off = await sourcesQ.create(u.id, { name: 'Off', kind: 'greenhouse', config: { company: 'c' } })
    await db.update(sources).set({ enabled: false }).where(eq(sources.id, off.id))
    const broken = await sourcesQ.create(u.id, { name: 'Broken', kind: 'greenhouse', config: { company: 'd' } })
    await db.update(sources).set({ errorCount: 5 }).where(eq(sources.id, broken.id))

    const now = new Date('2026-09-26T09:00:00Z')
    const first = await scheduleDailyJobs(now)
    // reminders + followups + gmail + digest + 2 sources + scam + email
    expect(first).toMatchObject({ day: '2026-09-26', users: 1, planned: 8, enqueued: 8 })
    const again = await scheduleDailyJobs(new Date('2026-09-26T21:00:00Z'))
    expect(again.enqueued).toBe(0)
    const nextDay = await scheduleDailyJobs(new Date(now.getTime() + DAY))
    expect(nextDay.enqueued).toBe(8)

    const polls = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.discoverySource))
    expect(new Set(polls.map((p) => (p.payload as { sourceId: string }).sourceId)).size).toBe(2)
    expect(polls.every((p) => p.idempotencyKey?.startsWith(`discovery-source:${u.id}:`))).toBe(true)
  })
})

describe('parity with the old sync-all', () => {
  it('reminders: one per overdue application per day, across re-runs and duplicate drains', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id)
    const j = await makeJob(u.id, co.id)
    const app = await makeApplication(u.id, j.id, { status: 'applied', nextActionAt: new Date(Date.now() - 5 * DAY) })
    await makeApplication(u.id, (await makeJob(u.id, co.id)).id, {
      status: 'rejected',
      nextActionAt: new Date(Date.now() - DAY),
    })

    const first = await runDay()
    const second = await runDay()
    expect(first.metrics.reminders_added).toBe(1)
    expect(second.metrics.reminders_added ?? 0).toBe(0)
    const reminders = (await db.select().from(activities).where(eq(activities.applicationId, app.id))).filter(
      (a) => a.kind === 'reminder',
    )
    expect(reminders).toHaveLength(1)
  })

  it('follow-ups: nudges once for applications past the 7-day mark', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id)
    const j = await makeJob(u.id, co.id)
    const app = await makeApplication(u.id, j.id, { status: 'applied', appliedAt: new Date(Date.now() - 10 * DAY) })

    const r = await runDay()
    expect(r.metrics.followups_recommended).toBe(1)
    // A retried job (e.g. after a crash) must not double-nudge.
    await db
      .update(queueJobs)
      .set({ status: 'queued' })
      .where(eq(queueJobs.type, JOB_TYPES.followups))
    await drain({ budgetMs: 10_000 })
    const nudges = (await db.select().from(activities).where(eq(activities.applicationId, app.id))).filter(
      (a) => a.kind === 'followup_recommended',
    )
    expect(nudges).toHaveLength(1)
  })

  it('digest: Monday in the user timezone only, at most once per week', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { timezone: 'UTC', weeklyDigestEnabled: true })
    const off = await makeUser()
    await profileQ.upsert(off.id, { timezone: 'UTC', weeklyDigestEnabled: false })
    const send = vi.spyOn(weekly, 'sendWeeklyDigest').mockImplementation(async ({ userId }) => {
      await profileQ.upsert(userId, { digestLastSentAt: new Date() })
      return { messageId: 'm', snapshot: {} as weekly.PipelineSnapshot }
    })
    vi.useFakeTimers({ toFake: ['Date'] })

    vi.setSystemTime(new Date('2026-09-27T09:00:00Z')) // Sunday
    expect((await runDay()).metrics.digests_sent ?? 0).toBe(0)

    vi.setSystemTime(new Date('2026-09-28T09:00:00Z')) // Monday
    expect((await runDay()).metrics.digests_sent).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0].userId).toBe(u.id)

    // A retry of the same Monday job (or a second drain) does not re-send.
    await db.update(queueJobs).set({ status: 'queued' }).where(eq(queueJobs.type, JOB_TYPES.digest))
    expect((await drain({ budgetMs: 10_000 })).metrics.digests_sent ?? 0).toBe(0)

    vi.setSystemTime(new Date('2026-09-29T09:00:00Z')) // Tuesday
    expect((await runDay()).metrics.digests_sent ?? 0).toBe(0)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it(`discovery: scores at most ${MAX_SCORED_PER_SOURCE} per source per run, the rest ingested unscored`, async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'x', skills: ['ts', 'go'], industries: ['fintech'] })
    await sourcesQ.create(u.id, { name: 'Acme', kind: 'greenhouse', config: { company: 'acme' } })
    stubGreenhouse(Array.from({ length: MAX_SCORED_PER_SOURCE + 5 }, (_, i) => jobItem(i)))
    const scoreSpy = vi.fn(() => scoreResult)
    aiHolder.current = new FixtureAIProvider({ scoreJob: scoreSpy }) as unknown as AIProvider

    const r = await runDay()
    expect(r.metrics.sources_polled).toBe(1)
    expect(r.metrics.new_discoveries).toBe(MAX_SCORED_PER_SOURCE + 5)
    expect(scoreSpy).toHaveBeenCalledTimes(MAX_SCORED_PER_SOURCE)
    const unscored = await db
      .select({ id: discoveries.id })
      .from(discoveries)
      .where(and(eq(discoveries.userId, u.id), isNull(discoveries.matchScore)))
    expect(unscored).toHaveLength(5)
  })

  it('discovery: time-boxed — scoring stops at the job deadline and the rows stay ingested', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'x', skills: ['ts', 'go'], industries: ['fintech'] })
    await sourcesQ.create(u.id, { name: 'Acme', kind: 'greenhouse', config: { company: 'acme' } })
    stubGreenhouse([jobItem(1), jobItem(2), jobItem(3)], 300)
    const scoreSpy = vi.fn(() => scoreResult)
    aiHolder.current = new FixtureAIProvider({ scoreJob: scoreSpy }) as unknown as AIProvider

    // The drain's clock runs ~109.9 s behind real time, so the discovery
    // job's cooperative deadline (start + 120 s timeout − 10 s margin) lands
    // ~100 ms from now in real time — before the 300 ms adapter returns.
    const lag = 109_900
    await scheduleDailyJobs(new Date(Date.now() - lag))
    const r = await drain({ budgetMs: 240_000, clock: () => Date.now() - lag, types: [JOB_TYPES.discoverySource] })
    expect(r.done).toBe(1)
    expect(r.metrics.discovery_budget_exhausted).toBe(1)
    expect(r.metrics.new_discoveries).toBe(3)
    expect(scoreSpy).not.toHaveBeenCalled()
  })

  it('discovery: a source that failed to poll is recorded on the source, not retried', async () => {
    const u = await makeUser()
    const src = await sourcesQ.create(u.id, { name: 'HN', kind: 'hn', config: {} })
    const r = await runDay()
    expect(r.metrics.sources_polled ?? 0).toBe(0)
    expect(r.errors.some((e) => e.startsWith(`${JOB_TYPES.discoverySource}: source ${src.id}`))).toBe(true)
    const [after] = await db.select().from(sources).where(eq(sources.id, src.id))
    expect(after!.errorCount).toBe(1)
    const [job] = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.discoverySource))
    expect(job!.status).toBe('done')
  })

  it('the discovery email runs after all of the user’s source polls', async () => {
    const u = await makeUser()
    await sourcesQ.create(u.id, { name: 'A', kind: 'greenhouse', config: { company: 'a' } })
    await sourcesQ.create(u.id, { name: 'B', kind: 'greenhouse', config: { company: 'b' } })
    stubGreenhouse([], 20)
    await runDay()
    const rows = await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))
    const finished = (t: string) =>
      rows.filter((r) => r.type === t).map((r) => r.finishedAt!.getTime())
    const lastPoll = Math.max(...finished(JOB_TYPES.discoverySource))
    expect(rows.every((r) => r.status === 'done')).toBe(true)
    expect(finished(JOB_TYPES.discoveryEmail)[0]).toBeGreaterThanOrEqual(lastPoll)
    expect(finished(JOB_TYPES.scamReassess)[0]).toBeGreaterThanOrEqual(lastPoll)
  })
})
