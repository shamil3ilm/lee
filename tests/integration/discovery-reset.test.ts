import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries as discTable, discoveryFeedback, jobRiskAssessments, queueJobs, shortlistEntries } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { resetDiscoveries } from '@/lib/discovery/reset'
import { queueRefetch } from '@/lib/discovery/reset-refetch'
import { promoteJobDiscovery } from '@/lib/discovery/service'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeUser } from '@/tests/factories'

function job(id: string, title = 'Backend Developer'): DiscoveryItem {
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName: 'Example Co',
    location: 'Dubai',
    remoteType: 'onsite',
    employmentType: 'fulltime',
    descriptionMd: '## Requirements\n- PHP and Laravel',
    applyUrl: `https://jobs.example.com/${id}`,
    techStack: [],
    raw: {},
  }
  return { sourceItemId: id, raw: { id }, normalized }
}

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => job(id))
const ai = new FixtureAIProvider()

function stub(items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = { kind: 'remoteok', fetch: async () => items }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'remoteok' ? fake : null))
}

async function rows(userId: string): Promise<Record<string, string>> {
  const r = await db.select({ id: discTable.sourceJobId, status: discTable.status }).from(discTable).where(eq(discTable.userId, userId))
  return Object.fromEntries(r.map((x) => [x.id, x.status]))
}

async function idOf(userId: string, sourceJobId: string): Promise<string> {
  const [r] = await db.select({ id: discTable.id }).from(discTable).where(and(eq(discTable.userId, userId), eq(discTable.sourceJobId, sourceJobId)))
  return r!.id
}

/** a: saved (application) · b: shortlisted · c: dismissed · d: being prepared · e, f: new. */
async function setup(): Promise<{ userId: string; sourceId: string }> {
  const u = await makeUser()
  await profileQ.upsert(u.id, { skills: ['PHP', 'Laravel'], learnedTitles: { 'brand analyst': { related: true, family: 'backend', at: '2026-10-01' } } })
  const source = await sourcesQ.create(u.id, { name: 'Feed', kind: 'remoteok', config: {} })
  stub(ITEMS)
  await runDiscoveryCycleForUser({ userId: u.id, ai })
  await promoteJobDiscovery({ userId: u.id, discoveryId: await idOf(u.id, 'a') })
  await db.update(discTable).set({ status: 'shortlisted' }).where(eq(discTable.id, await idOf(u.id, 'b')))
  await db.update(discTable).set({ status: 'dismissed' }).where(eq(discTable.id, await idOf(u.id, 'c')))
  const d = await idOf(u.id, 'd')
  await db.update(discTable).set({ status: 'shortlisted' }).where(eq(discTable.id, d))
  await db.insert(shortlistEntries).values({ userId: u.id, day: '2026-10-08', discoveryId: d, rank: 1, score: 80, state: 'preparing' })
  await db.insert(discoveryFeedback).values({ userId: u.id, discoveryId: await idOf(u.id, 'c'), reason: 'role' })
  return { userId: u.id, sourceId: source.id }
}

describe('reset discoveries', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes new, filtered and dismissed rows, never saved, applied or prepared ones', async () => {
    const { userId } = await setup()
    const r = await resetDiscoveries(userId)
    expect(r).toMatchObject({ deleted: 3, remaining: false })
    expect(await rows(userId)).toEqual({ a: 'saved', b: 'shortlisted', d: 'shortlisted' })
    // Scam Shield checks of the removed rows are gone; learned titles and feedback stay.
    const risks = await db
      .select()
      .from(jobRiskAssessments)
      .where(and(eq(jobRiskAssessments.userId, userId), eq(jobRiskAssessments.targetType, 'discovery')))
    expect(risks).toHaveLength(3)
    expect(Object.keys(((await profileQ.get(userId))!.learnedTitles ?? {}) as object)).toEqual(['brand analyst'])
    expect(await db.select().from(discoveryFeedback).where(eq(discoveryFeedback.userId, userId))).toHaveLength(1)
  })

  it('optionally removes unacted shortlisted rows and resets learned titles and feedback', async () => {
    const { userId } = await setup()
    await resetDiscoveries(userId, { includeShortlisted: true, resetLearned: true })
    expect(await rows(userId)).toEqual({ a: 'saved', d: 'shortlisted' })
    expect((await profileQ.get(userId))!.learnedTitles).toEqual({})
    expect(await db.select().from(discoveryFeedback).where(eq(discoveryFeedback.userId, userId))).toHaveLength(0)
  })

  it('lets postings come back on the next poll (re-import), and is idempotent', async () => {
    const { userId } = await setup()
    await resetDiscoveries(userId)
    expect(await resetDiscoveries(userId)).toMatchObject({ deleted: 0 })
    stub(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai })
    expect(await rows(userId)).toEqual({ a: 'saved', b: 'shortlisted', c: 'new', d: 'shortlisted', e: 'new', f: 'new' })
  })

  it('without re-import keeps dismissed postings as tombstones so they stay away', async () => {
    const { userId } = await setup()
    const r = await resetDiscoveries(userId, { allowReimport: false })
    expect(r.deleted).toBe(2)
    expect(r.tombstoned).toBe(1)
    stub(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai })
    expect((await rows(userId)).c).toBe('dismissed')
  })

  it('is scoped to the owner and to the selected sources', async () => {
    const { userId, sourceId } = await setup()
    const other = await setup()
    await resetDiscoveries(userId, { sourceIds: [crypto.randomUUID()] })
    expect(Object.keys(await rows(userId))).toHaveLength(6)
    await resetDiscoveries(userId, { sourceIds: [sourceId] })
    expect(Object.keys(await rows(userId))).toHaveLength(3)
    expect(Object.keys(await rows(other.userId))).toHaveLength(6)
  })

  it('queues a fresh poll of the enabled sources, even when today’s poll already ran', async () => {
    const { userId } = await setup()
    expect(await queueRefetch(userId, null)).toBe(1)
    const jobs = await db.select().from(queueJobs).where(and(eq(queueJobs.userId, userId), eq(queueJobs.type, JOB_TYPES.discoverySource)))
    expect(jobs.some((j) => (j.idempotencyKey ?? '').includes(':reset-'))).toBe(true)
  })
})
