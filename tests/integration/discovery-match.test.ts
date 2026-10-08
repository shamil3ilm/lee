import { blendScores } from '@/lib/discovery/match/blend'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries as discTable } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discQ from '@/lib/db/queries/discoveries'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { matchStale, rescoreMatches } from '@/lib/discovery/match/service'
import { enqueueMatchJob } from '@/lib/discovery/match/enqueue'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import { MATCH_SCORE_VERSION } from '@/lib/discovery/match/version'
import { saveJd } from '@/lib/discovery/match/jd-service'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeUser } from '@/tests/factories'

/** Synthetic GCC postings: no real employer or person. */
function job(id: string, title: string, over: Partial<NormalizedJob> = {}): DiscoveryItem {
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName: 'Example Gulf Co',
    location: 'Dubai, United Arab Emirates',
    remoteType: 'onsite',
    employmentType: 'fulltime',
    descriptionMd: '## Requirements\n- PHP and Laravel\n- MySQL',
    applyUrl: `https://jobs.example.com/${id}`,
    techStack: [],
    raw: {},
    ...over,
  }
  return { sourceItemId: id, raw: { id }, normalized }
}

const ITEMS: DiscoveryItem[] = [
  job('laravel-dubai', 'Laravel Developer'),
  job('k8s-riyadh', 'Backend Engineer', {
    location: 'Riyadh, KSA',
    descriptionMd: '## Requirements\n- Go\n- Kubernetes\n- Terraform',
  }),
  job('gardener', 'Gardener Handyman', { descriptionMd: 'Outdoor work.' }),
]

const scoreResult = {
  match_score: 70,
  strengths: [],
  red_flags: [],
  reasoning: '',
  location_match: 'priority_1' as const,
  seniority_match: 'match' as const,
  stack_overlap: [],
  stack_gaps: [],
  industry_match: 'weak' as const,
}

function stubAdapter(items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = { kind: 'remoteok', fetch: async () => items }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'remoteok' ? fake : null))
}

async function setup(): Promise<string> {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    headline: 'Backend developer',
    skills: ['PHP', 'Laravel', 'MySQL'],
    roleTypes: ['backend'],
    seniorityLevels: ['junior', 'mid'],
    locationPrefs: [{ country: 'AE' }, { country: 'SA' }],
    searchPrefsSavedAt: new Date(),
  })
  await sourcesQ.create(u.id, { name: 'Feed', kind: 'remoteok', config: {} })
  return u.id
}

async function fits(userId: string): Promise<Record<string, { score: number | null; key: string | null; status: string }>> {
  const rows = await db
    .select({ id: discTable.sourceJobId, score: discTable.fitScore, key: discTable.fitKey, status: discTable.status })
    .from(discTable)
    .where(eq(discTable.userId, userId))
  return Object.fromEntries(rows.map((r) => [r.id, { score: r.score, key: r.key, status: r.status }]))
}

describe('Match Score at ingest', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('scores EVERY new posting, filtered ones included, with no AI call needed', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    const scoreSpy = vi.fn(() => scoreResult)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: scoreSpy }) })
    const f = await fits(userId)
    expect(f['gardener']!.status).toBe('filtered')
    for (const row of Object.values(f)) {
      expect(typeof row.score).toBe('number')
      expect(row.key?.startsWith(`${MATCH_SCORE_VERSION}:`)).toBe(true)
    }
    expect(f['laravel-dubai']!.score!).toBeGreaterThan(f['k8s-riyadh']!.score!)
    expect(f['k8s-riyadh']!.score!).toBeGreaterThan(f['gardener']!.score!)
  })

  it('stores an explanation with the missing must-haves', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    const row = (await discQ.list(userId, { status: 'new' })).find((r) => r.title === 'Backend Engineer')!
    const detail = toMatchDetail(row.fitDetail)
    expect(detail?.components.map((c) => c.key)).toContain('skills')
    expect(detail?.missing).toEqual(expect.arrayContaining(['Kubernetes (required)', 'Terraform (required)']))
  })

  it('filters and sorts by Fit, the Match / AI blend the badge shows', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    const rows = await discQ.list(userId, { statuses: ['new', 'filtered'] })
    const laravel = rows.find((r) => r.title === 'Laravel Developer')!
    const min = blendScores(laravel.fitScore, laravel.matchScore)!
    const kept = await discQ.list(userId, { statuses: ['new', 'filtered'], minScore: min })
    expect(kept.map((r) => r.title)).toEqual(['Laravel Developer'])
    const sorted = await discQ.list(userId, { statuses: ['new', 'filtered'], sort: 'match' })
    expect(sorted[0]!.title).toBe('Laravel Developer')
  })
})

describe('title-only postings and a pasted JD', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('marks a posting without a JD as low confidence, and re-scores it from a pasted JD', async () => {
    const userId = await setup()
    stubAdapter([job('alert-1', 'Software Engineer', { descriptionMd: '', location: 'Dubai' })])
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    const [row] = await discQ.list(userId, { status: 'new' })
    expect(toMatchDetail(row!.fitDetail)?.confidence).toBe('title_only')

    expect(await saveJd(userId, row!.id, 'too short', 'pasted')).toEqual({ ok: false, error: expect.stringMatching(/whole job description/) })
    const jd = '## Responsibilities\n- Build REST APIs in Laravel\n## Requirements\n- PHP and Laravel\n- MySQL\n- Git and code review\n'.repeat(2)
    const r = await saveJd(userId, row!.id, jd, 'pasted')
    expect(r.ok).toBe(true)
    const [after] = await discQ.list(userId, { status: 'new' })
    const detail = toMatchDetail(after!.fitDetail)
    expect(detail?.confidence).toBe('full')
    expect(detail?.requirements.some((x) => x.status === 'met')).toBe(true)
    expect(after!.fitScore!).toBeGreaterThan(row!.fitScore!)
  })
})

describe('Match Score backfill', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('re-scores rows from before the score existed and stamps the applied key', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    await db.update(discTable).set({ fitScore: null, fitDetail: null, fitKey: null }).where(eq(discTable.userId, userId))
    expect(matchStale(await profileQ.get(userId))).toBe(true)
    const r = await rescoreMatches(userId)
    expect(r).toEqual({ scored: ITEMS.length, remaining: false })
    expect(Object.values(await fits(userId)).every((x) => typeof x.score === 'number')).toBe(true)
    expect(matchStale(await profileQ.get(userId))).toBe(false)
    // Idempotent: nothing is stale any more.
    expect(await rescoreMatches(userId)).toEqual({ scored: 0, remaining: false })
  })

  it('re-scores when the profile evidence changes, in bounded batches through the queue job', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    await rescoreMatches(userId)
    const before = (await fits(userId))['k8s-riyadh']!.score!

    await profileQ.upsert(userId, { skills: ['PHP', 'Laravel', 'MySQL', 'Go', 'Kubernetes', 'Terraform'] })
    expect(matchStale(await profileQ.get(userId))).toBe(true)
    expect((await rescoreMatches(userId, { maxRows: 0 })).remaining).toBe(true)

    await enqueueMatchJob(userId)
    const d = await drain({ userId, types: [JOB_TYPES.discoveryMatch], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
    expect(d.done).toBe(1)
    expect(d.metrics.match_scored).toBe(ITEMS.length)
    expect((await fits(userId))['k8s-riyadh']!.score!).toBeGreaterThan(before)
    expect(matchStale(await profileQ.get(userId))).toBe(false)
  })
})
