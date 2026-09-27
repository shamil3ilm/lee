import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as retentionQ from '@/lib/db/queries/retentionSettings'
import {
  DEFAULT_RETENTION_POLICY,
  runRetention,
  runRetentionForUser,
  totalChanged,
} from '@/lib/db/retention'
import { cleanUpNowAction, saveRetentionWindowsAction } from '@/app/(authed)/settings/storage/actions'
import { getStoragePageData } from '@/lib/usage/storage'
import { env } from '@/lib/env'
import { makeApplication, makeCompany, makeContact, makeDiscovery, makeJob, makeSource, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-26T03:30:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY)
const heavy = { raw: { big: 'r'.repeat(2_000) }, matchReasoning: { summary: 'm'.repeat(300) } }

beforeEach(() => sessionMock.mockReset())

async function aiLogs(userId: string | null, n: number, createdAt: Date): Promise<void> {
  await db.insert(s.aiCallLogs).values(
    Array.from({ length: n }, () => ({ userId, provider: 'groq', kind: 'k', status: 'ok', createdAt })),
  )
}

/** Clutter of every kind for one user, all well past the default windows. */
async function seedClutter(userId: string) {
  const src = await makeSource(userId)
  const stale = await makeDiscovery(userId, src.id, { ...heavy, normalized: { title: 'Stale', raw: { x: 1 } }, createdAt: daysAgo(200) })
  const dismissed = await makeDiscovery(userId, src.id, { ...heavy, status: 'dismissed', createdAt: daysAgo(200), updatedAt: daysAgo(100) })
  await aiLogs(userId, 3, daysAgo(400))
  await db.insert(s.processedGmailThreads).values({ userId, threadId: `t-${userId}`, processedAt: daysAgo(100) })
  await db.insert(s.webVitalsDaily).values({ userId, day: '2026-01-01', route: '/', metric: 'LCP', histogram: [1] })
  await db.insert(s.queueJobs).values({ userId, type: 'x', status: 'done', finishedAt: daysAgo(30) })
  return { src, stale, dismissed }
}

/** Everything the user acted on, all old. None of it may be touched. */
async function seedActed(userId: string) {
  const company = await makeCompany(userId, { notesMd: 'my notes', createdAt: daysAgo(900) })
  const job = await makeJob(userId, company.id, { descriptionMd: 'd'.repeat(500), createdAt: daysAgo(900) })
  const application = await makeApplication(userId, job.id, { status: 'applied', createdAt: daysAgo(900) })
  const src = await makeSource(userId)
  const saved = await makeDiscovery(userId, src.id, {
    ...heavy,
    status: 'saved',
    savedApplicationId: application.id,
    createdAt: daysAgo(900),
    updatedAt: daysAgo(900),
  })
  const shortlisted = await makeDiscovery(userId, src.id, { ...heavy, status: 'shortlisted', createdAt: daysAgo(900), updatedAt: daysAgo(900) })
  await makeContact(userId, { notes: 'met at conf', createdAt: daysAgo(900) })
  await db.insert(s.activities).values({ userId, applicationId: application.id, kind: 'note', payload: { text: 'hi' }, createdAt: daysAgo(900) })
  await db.insert(s.todos).values({ userId, title: 'Follow up', notesMd: 'n', createdAt: daysAgo(900) })
  const [doc] = await db
    .insert(s.documents)
    .values({ userId, applicationId: application.id, kind: 'tailored_cv', title: 'CV', content: { a: 1 }, createdAt: daysAgo(900) })
    .returning()
  await db.insert(s.documentAssets).values({
    userId,
    documentId: doc!.id,
    filename: 'photo.png',
    mimeType: 'image/png',
    sizeBytes: 3,
    bytes: Buffer.from('abc'),
    createdAt: daysAgo(900),
  })
  return { application, saved, shortlisted }
}

const ACTED_TABLES = ['companies', 'jobs', 'applications', 'contacts', 'activities', 'todos', 'documents', 'document_assets'] as const

async function counts(userId: string): Promise<Record<string, number>> {
  const entries = await Promise.all(
    ACTED_TABLES.map(async (t) => {
      const res = (await db.execute(
        sql`select count(*)::int as n from ${sql.identifier(t)} where user_id = ${userId}`,
      )) as unknown as { rows: { n: number }[] }
      return [t, Number(res.rows[0]?.n ?? 0)] as const
    }),
  )
  return Object.fromEntries(entries)
}

describe('runRetention', () => {
  it('removes stale clutter and keeps everything the user acted on', async () => {
    const u = await makeUser()
    const clutter = await seedClutter(u.id)
    const acted = await seedActed(u.id)
    const before = await counts(u.id)

    const r = await runRetention(NOW)
    expect(r).toMatchObject({
      users: 1,
      complete: true,
      expiredDiscoveries: 1,
      tombstonedDiscoveries: 1,
      aiCallLogs: 3,
      gmailThreads: 1,
      webVitals: 1,
      queueJobs: 1,
    })
    expect(r.compactedDiscoveries).toBeGreaterThanOrEqual(1)

    const disc = new Map((await db.select().from(s.discoveries)).map((d) => [d.id, d]))
    expect(disc.get(clutter.stale.id)).toMatchObject({ status: 'dismissed', raw: {}, normalized: { title: 'Stale' } })
    expect(disc.get(clutter.dismissed.id)).toMatchObject({ raw: {}, matchReasoning: null })
    // User-acted rows keep status and scoring; only the unread raw payload goes.
    expect(disc.get(acted.saved.id)).toMatchObject({ status: 'saved', savedApplicationId: acted.application.id, matchReasoning: heavy.matchReasoning })
    expect(disc.get(acted.shortlisted.id)).toMatchObject({ status: 'shortlisted', matchReasoning: heavy.matchReasoning })
    expect(await counts(u.id)).toEqual(before)
    const [asset] = await db.select().from(s.documentAssets)
    expect(asset!.bytes?.toString()).toBe('abc')
  })

  it('is idempotent: a second run changes nothing', async () => {
    const u = await makeUser()
    await seedClutter(u.id)
    await seedActed(u.id)
    expect(totalChanged(await runRetention(NOW))).toBeGreaterThan(0)
    expect(totalChanged(await runRetention(NOW))).toBe(0)
  })

  it('works through more rows than one batch', async () => {
    const u = await makeUser()
    await aiLogs(u.id, 23, daysAgo(400))
    const src = await makeSource(u.id)
    for (let i = 0; i < 7; i++) await makeDiscovery(u.id, src.id, { createdAt: daysAgo(100) })
    const r = await runRetention(NOW, { batchSize: 5 })
    expect(r.aiCallLogs).toBe(23)
    expect(r.expiredDiscoveries).toBe(7)
    expect(await db.select().from(s.aiCallLogs)).toHaveLength(0)
  })

  it('stops starting batches once the time budget is spent', async () => {
    const u = await makeUser()
    await aiLogs(u.id, 3, daysAgo(400))
    const r = await runRetention(NOW, { budgetMs: 0 })
    expect(r.complete).toBe(false)
    expect(totalChanged(r)).toBe(0)
    expect(await db.select().from(s.aiCallLogs)).toHaveLength(3)
  })

  it("applies each user's own windows and cleans logs of deleted users", async () => {
    const strict = await makeUser()
    const lax = await makeUser()
    await retentionQ.savePolicy(strict.id, { ...DEFAULT_RETENTION_POLICY, aiCallLogDays: 30 })
    await aiLogs(strict.id, 2, daysAgo(60))
    await aiLogs(lax.id, 2, daysAgo(60))
    await aiLogs(null, 1, daysAgo(400))

    const r = await runRetention(NOW)
    expect(r.aiCallLogs).toBe(2)
    expect(r.orphanAiCallLogs).toBe(1)
    const left = await db.select().from(s.aiCallLogs)
    expect(left.map((l) => l.userId)).toEqual([lax.id, lax.id])

    const view = await retentionQ.get(strict.id)
    expect(view.lastRun).toMatchObject({ trigger: 'cron', at: NOW, counts: { aiCallLogs: 2, orphanAiCallLogs: 1 } })
  })
})

describe('runRetentionForUser', () => {
  it("cleans only that user's rows", async () => {
    const me = await makeUser()
    const other = await makeUser()
    await aiLogs(me.id, 2, daysAgo(400))
    await aiLogs(other.id, 2, daysAgo(400))
    const r = await runRetentionForUser(me.id, NOW)
    expect(r).toMatchObject({ users: 1, aiCallLogs: 2, complete: true })
    expect((await db.select().from(s.aiCallLogs)).every((l) => l.userId === other.id)).toBe(true)
    expect((await retentionQ.get(me.id)).lastRun?.trigger).toBe('manual')
    expect((await retentionQ.get(other.id)).lastRun).toBeNull()
  })
})

describe('Settings › Storage actions', () => {
  it('Clean up now runs for the owner and reports what it removed', async () => {
    const owner = await makeUser(env.ALLOWED_EMAIL)
    await aiLogs(owner.id, 4, new Date(Date.now() - 400 * DAY))
    sessionMock.mockResolvedValue(owner.id)
    const r = await cleanUpNowAction()
    expect(r).toEqual({ success: true, message: 'Cleaned up 4 rows.' })
    expect(await cleanUpNowAction()).toEqual({ success: true, message: 'Nothing to clean up.' })

    const page = await getStoragePageData(owner.id)
    expect(page.settings.lastRun?.trigger).toBe('manual')
    expect(page.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['ai_call_logs', 'discoveries', 'retention_settings']))
  })

  it('refuses anyone but the owner', async () => {
    const stranger = await makeUser()
    await aiLogs(stranger.id, 1, new Date(Date.now() - 400 * DAY))
    sessionMock.mockResolvedValue(stranger.id)
    expect(await cleanUpNowAction()).toEqual({ error: 'Only the owner of this lee deployment can do that.' })
    expect(await saveRetentionWindowsAction({ ...DEFAULT_RETENTION_POLICY })).toEqual({
      error: 'Only the owner of this lee deployment can do that.',
    })
    expect(await db.select().from(s.aiCallLogs)).toHaveLength(1)
  })

  it('validates and saves the retention windows', async () => {
    const owner = await makeUser(env.ALLOWED_EMAIL)
    sessionMock.mockResolvedValue(owner.id)
    const tooShort = await saveRetentionWindowsAction({ ...DEFAULT_RETENTION_POLICY, staleDiscoveryDays: '2' })
    expect(tooShort).toEqual({ error: 'Unreviewed discoveries: at least 7 days.' })

    const form = Object.fromEntries(Object.entries(DEFAULT_RETENTION_POLICY).map(([k, v]) => [k, String(v)]))
    const ok = await saveRetentionWindowsAction({ ...form, dismissedDiscoveryDays: '45' })
    expect(ok).toMatchObject({ success: true })
    expect((await retentionQ.get(owner.id)).policy).toEqual({ ...DEFAULT_RETENTION_POLICY, dismissedDiscoveryDays: 45 })
  })
})
