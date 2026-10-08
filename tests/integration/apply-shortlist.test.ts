import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AIProvider } from '@/lib/ai'

// The discovery-source handler asks `getAIProviderForUser` for a provider;
// hand it the fixture provider (see queue-parity.test.ts).
const aiHolder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => aiHolder.current,
  getAIProviderForUser: async () => aiHolder.current,
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))

import { db } from '@/lib/db/client'
import { discoveries, jobRiskAssessments, queueJobs, shortlistEntries, systemEvents } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as shortlistQ from '@/lib/db/queries/shortlist'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { aiCallLogs, discoveryFeedback } from '@/lib/db/schema'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem } from '@/lib/discovery/adapters/types'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { buildShortlistForUser, readShortlist } from '@/lib/apply/shortlist'
import { later, notForMe } from '@/lib/apply/triage'
import { flushSystemEvents, installEventSink, uninstallEventSink } from '@/lib/logs/sink'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'

const originalFetch = globalThis.fetch

function jobItem(i: number, title = `Backend Engineer ${i}`): DiscoveryItem {
  return {
    sourceItemId: `gh-${i}`,
    raw: { id: i },
    normalized: {
      kind: 'job',
      title,
      companyName: 'Acme',
      companyDomain: 'acme.example',
      remoteType: 'remote',
      employmentType: 'fulltime',
      descriptionMd: 'Build payment APIs in PHP and Laravel.',
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${i}`,
      techStack: ['php', 'laravel'],
      raw: {},
    },
  }
}

function stubGreenhouse(items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = { kind: 'greenhouse', fetch: async () => items }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'greenhouse' ? fake : null))
}

const score = (n: number) => ({
  match_score: n,
  strengths: [],
  red_flags: [],
  reasoning: '',
  location_match: 'remote' as const,
  seniority_match: 'match' as const,
  stack_overlap: [],
  stack_gaps: [],
  industry_match: 'weak' as const,
})

beforeEach(() => {
  vi.restoreAllMocks()
  ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response('nothing', { status: 500 })) as unknown as typeof fetch
})

afterEach(() => {
  ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
})

describe('shortlist job after the polls', () => {
  it('runs after every poll and the Scam Shield re-check, and stores the top N with reasons', async () => {
    installEventSink()
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'Backend engineer', skills: ['php', 'laravel'], industries: ['fintech'], shortlistSize: 3, timezone: 'UTC' })
    await sourcesQ.create(u.id, { name: 'Acme', kind: 'greenhouse', config: { company: 'acme' } })
    stubGreenhouse([1, 2, 3, 4, 5].map((i) => jobItem(i)))
    let i = 0
    const scores = [40, 90, 60, 75, 20]
    aiHolder.current = new FixtureAIProvider({ scoreJob: () => score(scores[i++ % scores.length]!) }) as unknown as AIProvider

    await scheduleDailyJobs(new Date())
    const r = await drain({ budgetMs: 60_000, concurrency: 1 })
    expect(r.metrics.shortlisted).toBe(3)

    const jobs = await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))
    const finished = (t: string) => jobs.filter((j) => j.type === t).map((j) => j.finishedAt!.getTime())
    expect(jobs.every((j) => j.status === 'done')).toBe(true)
    expect(finished(JOB_TYPES.shortlist)[0]).toBeGreaterThanOrEqual(Math.max(...finished(JOB_TYPES.discoverySource)))
    expect(finished(JOB_TYPES.shortlist)[0]).toBeGreaterThanOrEqual(finished(JOB_TYPES.scamReassess)[0]!)
    expect(finished(JOB_TYPES.discoveryEmail)[0]).toBeGreaterThanOrEqual(finished(JOB_TYPES.shortlist)[0]!)

    const view = await readShortlist(u.id)
    expect(view.today).toBe(true)
    expect(view.entries.map((e) => e.matchScore)).toEqual([90, 75, 60])
    expect(view.entries.map((e) => e.rank)).toEqual([1, 2, 3])
    // Every ingested posting carries a Match Score; the chip shows both.
    expect(view.entries.every((e) => typeof e.fitScore === 'number')).toBe(true)
    expect(view.entries[0]?.reasons[0]).toMatchObject({ kind: 'match', label: expect.stringMatching(/^Match \d+ · AI 90$/) })
    expect(view.entries[0]?.reasons.some((x) => x.kind === 'fresh')).toBe(true)

    await flushSystemEvents()
    uninstallEventSink()
    const events = await db.select().from(systemEvents).where(eq(systemEvents.event, 'shortlist_built'))
    expect(events).toHaveLength(1)
    expect(events[0]?.context).toEqual({ candidates: 5, shortlisted: 3, size: 3 })
  })
})

describe('buildShortlistForUser', () => {
  async function setup() {
    const u = await makeUser()
    await profileQ.upsert(u.id, { timezone: 'UTC', shortlistSize: 5 })
    const src = await makeSource(u.id, { kind: 'greenhouse' })
    const disc = (title: string, matchScore: number, extra: Partial<typeof discoveries.$inferInsert> = {}) =>
      makeDiscovery(u.id, src.id, {
        matchScore,
        normalized: { kind: 'job', title, companyName: 'Acme', companyDomain: 'acme.example', applyUrl: 'https://acme.example/j' },
        ...extra,
      })
    return { u, src, disc }
  }

  it('never shortlists a quarantined posting', async () => {
    const { u, disc } = await setup()
    const scam = await disc('Data Entry Remote', 99)
    const ok = await disc('Backend Engineer', 50)
    await db.insert(jobRiskAssessments).values({
      userId: u.id,
      targetType: 'discovery',
      targetId: scam.id,
      score: 90,
      level: 'likely_scam',
      rulesVersion: 'test',
    })
    await buildShortlistForUser(u.id)
    const ids = (await readShortlist(u.id)).entries.map((e) => e.discoveryId)
    expect(ids).toEqual([ok.id])
  })

  it('leaves out filtered, dismissed and old postings', async () => {
    const { u, disc } = await setup()
    await disc('Filtered', 99, { status: 'filtered', filterReason: 'seniority: Senior' })
    await disc('Dismissed', 99, { status: 'dismissed' })
    await disc('Old', 99, { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
    const fresh = await disc('Fresh', 10)
    await buildShortlistForUser(u.id)
    expect((await readShortlist(u.id)).entries.map((e) => e.discoveryId)).toEqual([fresh.id])
  })

  it('ranks postings the AI never scored by their Match Score instead of a flat 25', async () => {
    const { u, disc } = await setup()
    const weak = await disc('Weak fit', 0, { matchScore: null, fitScore: 25 })
    const strong = await disc('Strong fit', 0, { matchScore: null, fitScore: 88 })
    const ai = await disc('AI scored', 60)
    await buildShortlistForUser(u.id)
    const entries = (await readShortlist(u.id)).entries
    expect(entries.map((e) => e.discoveryId)).toEqual([strong.id, ai.id, weak.id])
    expect(entries[0]?.reasons[0]).toEqual({ kind: 'match', label: 'Match 88', points: 44 })
  })

  it('is idempotent and keeps what the user acted on when rebuilt', async () => {
    const { u, disc } = await setup()
    const a = await disc('Backend A', 90)
    const b = await disc('Backend B', 80)
    const c = await disc('Backend C', 70)
    await buildShortlistForUser(u.id)
    await buildShortlistForUser(u.id)
    const rows = await db.select().from(shortlistEntries).where(eq(shortlistEntries.userId, u.id))
    expect(rows).toHaveLength(3)

    await later(u.id, a.id)
    await buildShortlistForUser(u.id)
    const view = await readShortlist(u.id)
    expect(view.entries.find((e) => e.discoveryId === a.id)?.state).toBe('later')
    expect(view.entries.filter((e) => e.state === 'open').map((e) => e.discoveryId)).toEqual([b.id, c.id])
    const [aRow] = await db.select().from(discoveries).where(eq(discoveries.id, a.id))
    expect(aRow?.status).toBe('shortlisted')
  })

  it('“Not for me” dismisses with a reason that feeds the ranking and the scoring call', async () => {
    const { u, disc } = await setup()
    const [call] = await db.insert(aiCallLogs).values({ userId: u.id, provider: 'fixture', kind: 'score_job', status: 'ok' }).returning()
    const first = await disc('Backend One', 95, { scoredByCallId: call!.id })
    const sameCompany = await disc('Backend Two', 90)
    const other = await makeDiscovery(u.id, first.sourceId, {
      matchScore: 70,
      normalized: { kind: 'job', title: 'Backend Three', companyName: 'Other', companyDomain: 'other.example' },
    })
    await notForMe(u.id, first.id, 'company')

    const [dismissed] = await db.select().from(discoveries).where(eq(discoveries.id, first.id))
    expect(dismissed?.status).toBe('dismissed')
    expect((await aiCallLogsQ.getById(u.id, call!.id))?.userAction).toBe('dismissed')
    const fb = await db.select().from(discoveryFeedback).where(eq(discoveryFeedback.userId, u.id))
    expect(fb).toMatchObject([{ reason: 'company', companyKey: 'acme.example', roleFamily: 'backend' }])

    await buildShortlistForUser(u.id)
    const entries = (await readShortlist(u.id)).entries
    // The same company drops below a weaker match elsewhere.
    expect(entries.map((e) => e.discoveryId)).toEqual([other.id, sameCompany.id])
    expect(entries[1]?.reasons.some((r) => r.label === 'You passed on this company')).toBe(true)
  })

  it('suggests the résumé variant for each entry', async () => {
    const { u, disc } = await setup()
    const { createVariant } = await import('@/lib/variants/service')
    const v = await createVariant(u.id, { region: 'remote', roleFamily: 'backend' })
    await disc('Backend Engineer', 80, { regions: ['remote'] })
    await buildShortlistForUser(u.id)
    const [entry] = (await readShortlist(u.id)).entries
    expect(entry?.variantId).toBe(v.id)
    expect(entry?.variantName).toBe(v.name)
    expect(await shortlistQ.latestDay(u.id)).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe('shortlist in emails', () => {
  it('adds the open picks to the weekly digest unless the user turned it off', async () => {
    const { gatherPipelineSnapshot } = await import('@/lib/digest/weekly')
    const { renderWeeklyDigestHtml } = await import('@/lib/digest/email-template')
    const u = await makeUser()
    await profileQ.upsert(u.id, { timezone: 'UTC' })
    const src = await makeSource(u.id, { kind: 'greenhouse' })
    await makeDiscovery(u.id, src.id, {
      matchScore: 88,
      normalized: { kind: 'job', title: 'Backend Engineer', companyName: 'Payco', companyDomain: 'payco.example' },
    })
    await buildShortlistForUser(u.id)
    const snap = await gatherPipelineSnapshot(u.id)
    expect(snap.shortlist).toMatchObject([{ title: 'Backend Engineer', companyName: 'Payco' }])
    expect(renderWeeklyDigestHtml(snap)).toContain('Your shortlist')

    await profileQ.upsert(u.id, { shortlistInEmails: false })
    const off = await gatherPipelineSnapshot(u.id)
    expect(off.shortlist).toEqual([])
    expect(renderWeeklyDigestHtml(off)).not.toContain('Your shortlist')
  })
})
