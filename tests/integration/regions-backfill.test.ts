import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries as discTable } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discQ from '@/lib/db/queries/discoveries'
import { enqueueRelevanceJob } from '@/lib/discovery/relevance/enqueue'
import { relevanceStale } from '@/lib/discovery/relevance/service'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeUser } from '@/tests/factories'

/**
 * The region backfill: rows stored before the region hierarchy (no
 * region_ids, an old relevance key) are re-tagged by the existing batched
 * relevance job, and the hierarchical Region filter and group counts read
 * the stored ids.
 */

const POSTINGS: ReadonlyArray<readonly [string, string, string]> = [
  ['kochi', 'Infopark, Kochi', 'onsite'],
  ['tvm', 'Technopark, Trivandrum', 'onsite'],
  ['blr', 'Bengaluru, Karnataka', 'onsite'],
  ['dxb', 'DIFC, Dubai', 'onsite'],
  ['ruh', 'Riyadh, SA', 'onsite'],
  ['remote-in', 'Remote - India', 'remote'],
]

async function setup(): Promise<string> {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    headline: 'Backend developer',
    skills: ['PHP', 'Laravel', 'MySQL'],
    roleTypes: ['backend'],
    seniorityLevels: ['junior', 'mid'],
    targetRegions: ['kerala', 'dubai'],
    remoteScope: 'worldwide',
    searchPrefsSavedAt: new Date(),
  })
  const source = await sourcesQ.create(u.id, { name: 'Board', kind: 'remoteok', config: {} })
  // Rows as an older build stored them: ungated, no region ids.
  await discQ.insertManyForSource(
    u.id,
    source.id,
    POSTINGS.map(([id, location, remoteType]) => ({
      sourceJobId: id,
      raw: { id },
      normalized: {
        kind: 'job',
        title: 'Laravel Developer',
        companyName: 'Acme',
        location,
        remoteType,
        employmentType: 'fulltime',
        descriptionMd: 'Build APIs in PHP and Laravel.',
        applyUrl: `https://acme.example/jobs/${id}`,
        techStack: ['php', 'laravel'],
      },
    })),
  )
  return u.id
}

async function regionIds(userId: string): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ id: discTable.sourceJobId, ids: discTable.regionIds, status: discTable.status })
    .from(discTable)
    .where(eq(discTable.userId, userId))
  return Object.fromEntries(rows.map((r) => [r.id, r.ids]))
}

describe('region backfill via the relevance queue job', () => {
  it('re-tags stored rows with the deepest places and their ancestors', async () => {
    const userId = await setup()
    expect(Object.values(await regionIds(userId)).every((ids) => ids.length === 0)).toBe(true)
    expect(relevanceStale(await profileQ.get(userId))).toBe(true)

    await enqueueRelevanceJob(userId)
    const d = await drain({ userId, types: [JOB_TYPES.discoveryRelevance], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
    expect(d.done).toBe(1)
    expect(relevanceStale(await profileQ.get(userId))).toBe(false)

    const ids = await regionIds(userId)
    expect(ids['kochi']).toEqual(['kochi', 'kerala', 'in'])
    expect(ids['tvm']).toEqual(['thiruvananthapuram', 'kerala', 'in'])
    expect(ids['dxb']).toEqual(['dubai', 'ae', 'gcc'])
    expect(ids['ruh']).toEqual(['riyadh', 'sa', 'gcc'])
    expect(ids['remote-in']).toEqual(expect.arrayContaining(['in', 'remote', 'remote-india-tz']))
  })

  it('filters hierarchically: Kerala, GCC, Dubai only, and the remote scope', async () => {
    const userId = await setup()
    await enqueueRelevanceJob(userId)
    await drain({ userId, types: [JOB_TYPES.discoveryRelevance], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
    const ids = async (region: string[]): Promise<string[]> =>
      (await discQ.list(userId, { status: 'all', region })).map((r) => r.applyUrl!.split('/').pop()!).sort()

    expect(await ids(['kerala'])).toEqual(['kochi', 'tvm'])
    expect(await ids(['gcc'])).toEqual(['dxb', 'ruh'])
    expect(await ids(['dubai'])).toEqual(['dxb'])
    expect(await ids(['in'])).toEqual(['blr', 'kochi', 'remote-in', 'tvm'])
    expect(await ids(['remote'])).toEqual(['remote-in'])
    expect(await ids(['kerala', 'dubai'])).toEqual(['dxb', 'kochi', 'tvm'])
  })

  it('gates with the saved selection: Kerala and Dubai pass, Bengaluru and Riyadh are filtered', async () => {
    const userId = await setup()
    await enqueueRelevanceJob(userId)
    await drain({ userId, types: [JOB_TYPES.discoveryRelevance], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
    const rows = await db
      .select({ id: discTable.sourceJobId, status: discTable.status, reason: discTable.filterReason })
      .from(discTable)
      .where(eq(discTable.userId, userId))
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by['kochi']!.status).toBe('new')
    expect(by['dxb']!.status).toBe('new')
    expect(by['remote-in']!.status).toBe('new')
    expect(by['blr']).toMatchObject({ status: 'filtered', reason: 'location: Bengaluru' })
    expect(by['ruh']).toMatchObject({ status: 'filtered', reason: 'location: Riyadh' })
  })

  it('counts postings per region for "Group by region"', async () => {
    const userId = await setup()
    await enqueueRelevanceJob(userId)
    await drain({ userId, types: [JOB_TYPES.discoveryRelevance], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
    const counts = await discQ.countByRegion(userId, { status: 'all' })
    expect(counts.get('gcc')).toBe(2)
    expect(counts.get('ae')).toBe(1)
    expect(counts.get('kerala')).toBe(2)
    expect(counts.get('in')).toBe(4)
    expect(counts.get('remote')).toBe(1)
  })
})
