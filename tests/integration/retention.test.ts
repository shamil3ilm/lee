import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import {
  AI_CALL_LOG_RETENTION_DAYS,
  DEAD_JOB_RETENTION_DAYS,
  DISMISSED_DISCOVERY_RETENTION_DAYS,
  DONE_JOB_RETENTION_DAYS,
  GMAIL_THREAD_RETENTION_DAYS,
  compactDiscoveryPayloads,
  pruneAiCallLogs,
  pruneQueueJobs,
  tombstoneDismissedDiscoveries,
  pruneProcessedGmailThreads,
  runRetention,
} from '@/lib/db/retention'
import * as discQ from '@/lib/db/queries/discoveries'
import * as compDiscQ from '@/lib/db/queries/companyDiscoveries'
import { makeCompany, makeDiscovery, makeJob, makeApplication, makeSource, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-26T03:00:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY)

async function riskRow(userId: string, targetId: string, targetType = 'discovery') {
  await db.insert(s.jobRiskAssessments).values({
    userId,
    targetType,
    targetId,
    score: 10,
    level: 'safe',
    rulesVersion: '1',
  })
}

async function aiLog(userId: string, createdAt: Date) {
  const [row] = await db
    .insert(s.aiCallLogs)
    .values({ userId, provider: 'gemini', kind: 'score_job', status: 'ok', createdAt })
    .returning()
  return row!
}

describe('retention defaults', () => {
  it('keeps the documented windows', () => {
    expect(DISMISSED_DISCOVERY_RETENTION_DAYS).toBe(90)
    expect(AI_CALL_LOG_RETENTION_DAYS).toBe(180)
    expect(GMAIL_THREAD_RETENTION_DAYS).toBe(35)
  })
})

const heavyJob = (i: number) => ({
  kind: 'job',
  title: `Engineer ${i}`,
  companyName: 'Acme',
  descriptionMd: 'x'.repeat(4_000),
  applyUrl: `https://acme.test/${i}`,
  techStack: ['ts'],
  raw: { big: 'y'.repeat(4_000) },
})

describe('tombstoneDismissedDiscoveries', () => {
  it('keeps old dismissed rows as slim tombstones and drops their risk rows', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const heavy = { raw: { big: 'z'.repeat(4_000) }, matchReasoning: { summary: 'r'.repeat(500) } }
    const oldDismissed = await makeDiscovery(u.id, src.id, {
      ...heavy,
      normalized: heavyJob(1),
      status: 'dismissed',
      updatedAt: daysAgo(91),
    })
    const freshDismissed = await makeDiscovery(u.id, src.id, {
      ...heavy,
      normalized: heavyJob(2),
      status: 'dismissed',
      updatedAt: daysAgo(10),
    })
    const oldNew = await makeDiscovery(u.id, src.id, { ...heavy, normalized: heavyJob(3), status: 'new', updatedAt: daysAgo(200) })
    await riskRow(u.id, oldDismissed.id)
    await riskRow(u.id, freshDismissed.id)
    // A job-target row sharing the id space must never be touched.
    await riskRow(u.id, oldDismissed.id, 'job')

    expect(await tombstoneDismissedDiscoveries(NOW)).toBe(1)
    // Idempotent: an already-slim tombstone is not rewritten.
    expect(await tombstoneDismissedDiscoveries(NOW)).toBe(0)

    // Nothing is deleted.
    expect(await db.select().from(s.discoveries)).toHaveLength(3)
    const [tomb] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, oldDismissed.id))
    expect(tomb).toMatchObject({
      sourceId: src.id,
      sourceJobId: oldDismissed.sourceJobId,
      status: 'dismissed',
      raw: {},
      normalized: { kind: 'job', title: 'Engineer 1', companyName: 'Acme' },
      matchReasoning: null,
    })
    expect(tomb!.updatedAt.getTime()).toBe(daysAgo(91).getTime())
    expect(tomb!.createdAt.getTime()).toBe(oldDismissed.createdAt.getTime())

    // Rows inside the window or not dismissed keep their payload.
    const [fresh] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, freshDismissed.id))
    expect(fresh!.normalized).toEqual(heavyJob(2))
    const [kept] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, oldNew.id))
    expect(kept!.normalized).toEqual(heavyJob(3))

    const risks = await db.select().from(s.jobRiskAssessments)
    expect(risks.map((r) => `${r.targetType}:${r.targetId}`).sort()).toEqual(
      [`discovery:${freshDismissed.id}`, `job:${oldDismissed.id}`].sort(),
    )
  })

  it('a re-ingested old dismissed job stays dismissed and never reappears in the inbox', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const old = await makeDiscovery(u.id, src.id, {
      sourceJobId: 'gh-4242',
      normalized: heavyJob(42),
      raw: { big: 'y' },
      status: 'dismissed',
      updatedAt: daysAgo(120),
    })
    await tombstoneDismissedDiscoveries(NOW)

    // The source still lists the posting: the next discovery cycle re-ingests
    // it through the normal dedupe path.
    const again = await discQ.upsertBySource(u.id, src.id, 'gh-4242', { big: 'y' }, heavyJob(42))
    expect(again.isNew).toBe(false)
    expect(again.discovery.id).toBe(old.id)
    const [row] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, old.id))
    expect(row!.status).toBe('dismissed')

    expect(await discQ.list(u.id, { status: 'new' })).toEqual([])
    expect(await discQ.countNew(u.id)).toBe(0)
    expect(await db.select().from(s.discoveries)).toHaveLength(1)
  })

  it('tombstones old dismissed company discoveries the same way', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const normalized = { kind: 'company', name: 'Acme', description: 'd'.repeat(3_000), raw: { x: 1 } }
    await db.insert(s.companyDiscoveries).values([
      { userId: u.id, sourceId: src.id, sourceCompanyId: 'a', raw: { x: 1 }, normalized, status: 'dismissed', updatedAt: daysAgo(120) },
      { userId: u.id, sourceId: src.id, sourceCompanyId: 'b', raw: { x: 1 }, normalized, status: 'new', updatedAt: daysAgo(120) },
    ])
    expect(await tombstoneDismissedDiscoveries(NOW)).toBe(1)
    const rows = await db.select().from(s.companyDiscoveries)
    expect(rows).toHaveLength(2)
    const a = rows.find((r) => r.sourceCompanyId === 'a')!
    expect(a).toMatchObject({ status: 'dismissed', raw: {}, normalized: { kind: 'company', name: 'Acme' } })
    expect(rows.find((r) => r.sourceCompanyId === 'b')!.normalized).toEqual(normalized)

    const again = await compDiscQ.upsertBySource(u.id, src.id, 'a', { x: 1 }, normalized)
    expect(again.isNew).toBe(false)
    const [row] = await db.select().from(s.companyDiscoveries).where(eq(s.companyDiscoveries.id, a.id))
    expect(row!.status).toBe('dismissed')
  })
})

describe('pruneAiCallLogs', () => {
  it('deletes logs older than 180 days and detaches referencing rows', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const old = await aiLog(u.id, daysAgo(181))
    const recent = await aiLog(u.id, daysAgo(179))
    const d = await makeDiscovery(u.id, src.id, { scoredByCallId: old.id })
    const [score] = await db
      .insert(s.cvScores)
      .values({
        userId: u.id,
        sourceKind: 'upload',
        overall: 50,
        grade: 'C',
        scores: {},
        dimensions: {},
        findings: [],
        scorerVersion: '1',
        aiCallId: old.id,
      })
      .returning()

    const n = await pruneAiCallLogs(NOW)
    expect(n).toBe(1)
    const ids = (await db.select({ id: s.aiCallLogs.id }).from(s.aiCallLogs)).map((r) => r.id)
    expect(ids).toEqual([recent.id])
    const [disc] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, d.id))
    expect(disc!.scoredByCallId).toBeNull()
    const [cv] = await db.select().from(s.cvScores).where(eq(s.cvScores.id, score!.id))
    expect(cv!.aiCallId).toBeNull()
  })

  it('works through more rows than one batch', async () => {
    const u = await makeUser()
    await db.insert(s.aiCallLogs).values(
      Array.from({ length: 25 }, () => ({
        userId: u.id,
        provider: 'gemini',
        kind: 'k',
        status: 'ok',
        createdAt: daysAgo(400),
      })),
    )
    expect(await pruneAiCallLogs(NOW, { batchSize: 10 })).toBe(25)
    expect(await db.select().from(s.aiCallLogs)).toHaveLength(0)
  })
})

describe('pruneProcessedGmailThreads', () => {
  it('deletes dedup markers older than 35 days', async () => {
    const u = await makeUser()
    await db.insert(s.processedGmailThreads).values([
      { userId: u.id, threadId: 'old', processedAt: daysAgo(36) },
      { userId: u.id, threadId: 'new', processedAt: daysAgo(34) },
    ])
    expect(await pruneProcessedGmailThreads(NOW)).toBe(1)
    const left = await db.select().from(s.processedGmailThreads)
    expect(left.map((r) => r.threadId)).toEqual(['new'])
  })
})

describe('compactDiscoveryPayloads', () => {
  it('drops the unread raw payloads from rows older than a day, leaving render fields', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    const normalized = { kind: 'job', title: 'Eng', companyName: 'Acme', raw: { big: 'x'.repeat(100) } }
    const old = await makeDiscovery(u.id, src.id, {
      raw: { big: 'y'.repeat(100) },
      normalized,
      createdAt: daysAgo(2),
    })
    const fresh = await makeDiscovery(u.id, src.id, {
      raw: { big: 'z' },
      normalized,
      createdAt: new Date(NOW.getTime() - 60_000),
    })
    expect(await compactDiscoveryPayloads(NOW)).toBe(1)
    // Idempotent.
    expect(await compactDiscoveryPayloads(NOW)).toBe(0)

    const [o] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, old.id))
    expect(o!.raw).toEqual({})
    expect(o!.normalized).toEqual({ kind: 'job', title: 'Eng', companyName: 'Acme' })
    const [f] = await db.select().from(s.discoveries).where(eq(s.discoveries.id, fresh.id))
    expect(f!.raw).toEqual({ big: 'z' })
  })
})

describe('runRetention', () => {
  it('runs every step and reports counts', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    await makeApplication(u.id, j.id)
    await aiLog(u.id, daysAgo(365))
    await db.insert(s.processedGmailThreads).values({ userId: u.id, threadId: 't', processedAt: daysAgo(100) })
    await db.insert(s.queueJobs).values({ type: 't', status: 'done', finishedAt: daysAgo(20) })
    const result = await runRetention(NOW)
    expect(result).toEqual({
      tombstonedDiscoveries: 0,
      aiCallLogs: 1,
      gmailThreads: 1,
      compactedDiscoveries: 0,
      queueJobs: 1,
      webVitals: 0,
    })
  })
})

describe('pruneQueueJobs', () => {
  it(`deletes done jobs after ${DONE_JOB_RETENTION_DAYS} days and dead jobs after ${DEAD_JOB_RETENTION_DAYS}`, async () => {
    const rows = await db
      .insert(s.queueJobs)
      .values([
        { type: 't', status: 'done', finishedAt: daysAgo(DONE_JOB_RETENTION_DAYS + 1) },
        { type: 't', status: 'done', finishedAt: daysAgo(DONE_JOB_RETENTION_DAYS - 1) },
        { type: 't', status: 'dead', finishedAt: daysAgo(DONE_JOB_RETENTION_DAYS + 1) },
        { type: 't', status: 'dead', finishedAt: daysAgo(DEAD_JOB_RETENTION_DAYS + 1) },
        { type: 't', status: 'failed', createdAt: daysAgo(90) },
        { type: 't', status: 'queued', createdAt: daysAgo(90) },
      ])
      .returning()
    expect(await pruneQueueJobs(NOW, { batchSize: 1 })).toBe(2)
    const left = await db.select().from(s.queueJobs)
    expect(left.map((r) => r.id).sort()).toEqual([rows[1]!.id, rows[2]!.id, rows[4]!.id, rows[5]!.id].sort())
  })
})
