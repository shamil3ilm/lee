import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries as discTable } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import type { ScoreJobContext } from '@/lib/ai/prompts/score-job'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discQ from '@/lib/db/queries/discoveries'
import * as relQ from '@/lib/db/queries/discoveryRelevance'
import * as docsQ from '@/lib/db/queries/documents'
import { saveMasterCV } from '@/lib/documents/master'
import type { MasterCV } from '@/lib/documents/types'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { loadRoleSuggestions, reevaluateRelevance, relevanceStale } from '@/lib/discovery/relevance/service'
import { enqueueRelevanceJob } from '@/lib/discovery/relevance/enqueue'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

function job(id: string, title: string, over: Partial<NormalizedJob> = {}): DiscoveryItem {
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName: 'Acme',
    companyDomain: 'acme.example',
    location: '',
    remoteType: 'remote',
    employmentType: 'fulltime',
    descriptionMd: 'Build APIs.',
    applyUrl: `https://acme.example/jobs/${id}`,
    techStack: ['php', 'laravel'],
    raw: {},
    ...over,
  }
  return { sourceItemId: id, raw: { id }, normalized }
}

/** A RemoteOK-like mix: two fits, four that the user's preferences exclude. */
const ITEMS: DiscoveryItem[] = [
  job('fit-1', 'Laravel Developer', { location: 'Dubai', remoteType: 'onsite' }),
  job('fit-2', 'Backend Engineer', { location: 'Remote' }),
  job('senior', 'Engineering Director'),
  // No stack overlap: the domain rule filters it on its title (trades) alone.
  job('gardener', 'Gardener Handyman Driver', { techStack: [], descriptionMd: 'Garden maintenance and deliveries.' }),
  job('us-only', 'Backend Engineer II', { location: 'Remote - US' }),
  job('frontend', 'Frontend Engineer', { techStack: ['react'] }),
]

function stubAdapter(items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = { kind: 'remoteok', fetch: async () => items }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'remoteok' ? fake : null))
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

const PREFS = {
  roleTypes: ['backend', 'fullstack'],
  seniorityLevels: ['junior', 'mid'],
  locationPrefs: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'].map((country) => ({ country, cities: [], priority: 1 })),
  remoteScope: 'worldwide',
}

async function setup(withPrefs: boolean): Promise<string> {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    headline: 'Backend developer',
    skills: ['PHP', 'Laravel', 'MySQL'],
    industries: ['fintech'],
    ...(withPrefs ? { ...PREFS, searchPrefsSavedAt: new Date() } : {}),
  })
  await sourcesQ.create(u.id, { name: 'RemoteOK', kind: 'remoteok', config: {} })
  return u.id
}

async function statuses(userId: string): Promise<Record<string, { status: string; reason: string | null }>> {
  const rows = await db
    .select({ id: discTable.sourceJobId, status: discTable.status, reason: discTable.filterReason })
    .from(discTable)
    .where(eq(discTable.userId, userId))
  return Object.fromEntries(rows.map((r) => [r.id, { status: r.status, reason: r.reason }]))
}

describe('relevance gate at ingest', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('with no preferences, filters only the unrelated field and scores the rest', async () => {
    const userId = await setup(false)
    stubAdapter(ITEMS)
    const scoreSpy = vi.fn(() => scoreResult)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: scoreSpy }) })
    const s = await statuses(userId)
    expect(s['gardener']).toEqual({ status: 'filtered', reason: 'domain: Trades/Field work' })
    expect(Object.entries(s).filter(([k]) => k !== 'gardener').every(([, v]) => v.status === 'new')).toBe(true)
    expect(scoreSpy).toHaveBeenCalledTimes(ITEMS.length - 1)
  })

  it('marks non-matching postings filtered, with reasons, and AI-scores only the relevant ones', async () => {
    const userId = await setup(true)
    stubAdapter(ITEMS)
    const scoreSpy = vi.fn((_j: NormalizedJob, _p: unknown, _c?: ScoreJobContext) => scoreResult)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: scoreSpy }) })
    const s = await statuses(userId)
    expect(s['fit-1']).toEqual({ status: 'new', reason: null })
    expect(s['fit-2']).toEqual({ status: 'new', reason: null })
    expect(s['senior']).toEqual({ status: 'filtered', reason: 'seniority: Director' })
    expect(s['gardener']).toEqual({ status: 'filtered', reason: 'domain: Trades/Field work' })
    expect(s['us-only']).toEqual({ status: 'filtered', reason: 'location: US-only' })
    expect(s['frontend']).toEqual({ status: 'filtered', reason: 'role: Frontend' })
    expect(scoreSpy).toHaveBeenCalledTimes(2)
    expect(scoreSpy.mock.calls.map((c) => c[0].title).sort()).toEqual(['Backend Engineer', 'Laravel Developer'])
    // The scoring prompt gets the profile / master-CV digest.
    expect(scoreSpy.mock.calls[0]![2]?.cvDigest).toContain('Profile skills: PHP, Laravel, MySQL')

    // The next run retries unscored rows — never the filtered ones.
    const again = vi.fn(() => scoreResult)
    await db.update(discTable).set({ matchScore: null }).where(eq(discTable.userId, userId))
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: again }) })
    expect(again).toHaveBeenCalledTimes(2)
  })

  it('tags regions for the Region filter', async () => {
    const userId = await setup(true)
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    const uae = await discQ.list(userId, { status: 'new', region: 'ae' })
    expect(uae.map((r) => r.title)).toEqual(['Laravel Developer'])
    expect(await discQ.countList(userId, { status: 'new', region: 'gcc' })).toBe(1)
    expect(await discQ.countList(userId, { status: 'new', region: 'remote' })).toBe(1)
  })
})

describe('re-evaluation when preferences change', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('re-gates existing discoveries, keeps "Show anyway" rows, and stamps the applied key', async () => {
    const userId = await setup(false)
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    // Before preferences: only the domain rule (the gardener).
    expect(Object.values(await statuses(userId)).filter((s) => s.status === 'filtered')).toHaveLength(1)

    await profileQ.upsert(userId, { ...PREFS, searchPrefsSavedAt: new Date() })
    expect(relevanceStale(await profileQ.get(userId))).toBe(true)
    const r = await reevaluateRelevance(userId)
    expect(r).toEqual({ evaluated: ITEMS.length, filtered: 4, remaining: false })
    expect(relevanceStale(await profileQ.get(userId))).toBe(false)

    // "Show anyway" survives a later re-evaluation.
    const senior = (await discQ.list(userId, { status: 'filtered' })).find((d) => d.title === 'Engineering Director')!
    expect(await relQ.showAnyway(userId, [senior.id])).toBe(1)
    await profileQ.upsert(userId, { seniorityLevels: ['junior'] })
    await reevaluateRelevance(userId)
    expect((await statuses(userId))['senior']!.status).toBe('new')

    // Turning preferences off restores everything but the unrelated field.
    await profileQ.upsert(userId, { searchPrefsSavedAt: null })
    await reevaluateRelevance(userId)
    const after = await statuses(userId)
    expect(Object.entries(after).filter(([, v]) => v.status === 'filtered').map(([k]) => k)).toEqual(['gardener'])
  })

  it('leaves shortlisted, saved and dismissed rows in their status', async () => {
    const userId = await setup(false)
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    await db.update(discTable).set({ status: 'shortlisted' }).where(eq(discTable.sourceJobId, 'senior'))
    await db.update(discTable).set({ status: 'dismissed' }).where(eq(discTable.sourceJobId, 'gardener'))
    await profileQ.upsert(userId, { ...PREFS, searchPrefsSavedAt: new Date() })
    await reevaluateRelevance(userId)
    const s = await statuses(userId)
    expect(s['senior']).toEqual({ status: 'shortlisted', reason: 'seniority: Director' })
    expect(s['gardener']!.status).toBe('dismissed')
  })

  it('processes in bounded batches and resumes through the queue job', async () => {
    const userId = await setup(false)
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    await profileQ.upsert(userId, { ...PREFS, searchPrefsSavedAt: new Date() })
    const partial = await reevaluateRelevance(userId, { maxRows: 0 })
    expect(partial.remaining).toBe(true)
    expect(relevanceStale(await profileQ.get(userId))).toBe(true)

    await enqueueRelevanceJob(userId)
    const d = await drain({ userId, types: [JOB_TYPES.discoveryRelevance], budgetMs: 20_000, maxJobs: 2, concurrency: 1 })
    expect(d.done).toBe(1)
    expect(d.metrics.relevance_evaluated).toBe(ITEMS.length)
    expect(relevanceStale(await profileQ.get(userId))).toBe(false)
    expect(await discQ.countList(userId, { status: 'filtered' })).toBe(4)
  })

  it('dismisses every filtered posting in one step', async () => {
    const userId = await setup(true)
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    expect(await relQ.dismissAllFiltered(userId)).toBe(4)
    expect(await discQ.countList(userId, { status: 'filtered' })).toBe(0)
    expect(await discQ.countList(userId, { status: 'dismissed' })).toBe(4)
  })
})

describe('list, count and ranking', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('counts with the same filters it lists with, and sinks soft-penalised rows', async () => {
    const userId = await setup(true)
    stubAdapter([
      job('a', 'Laravel Developer', { location: 'Dubai', remoteType: 'onsite', descriptionMd: 'Rotational shifts, 24x7.' }),
      job('b', 'PHP Developer', { location: 'Riyadh', remoteType: 'onsite' }),
    ])
    await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: () => scoreResult }) })
    const rows = await discQ.list(userId, { status: 'new', sort: 'combined' })
    expect(rows.map((r) => r.title)).toEqual(['PHP Developer', 'Laravel Developer'])
    expect(rows[1]!.relevanceNotes.penalties).toEqual(['rotational shifts'])
    expect(await discQ.countList(userId, { status: 'new', scoredOnly: true, minScore: 60 })).toBe(2)
    expect(await discQ.countList(userId, { status: 'new', scoredOnly: true, minScore: 90 })).toBe(0)
    expect(await discQ.countList(userId, { statuses: ['new', 'filtered'] })).toBe(2)
  })
})

describe('role suggestions use the profile and master CV only', () => {
  const master: MasterCV = {
    basics: { name: 'Test Person', headline: 'Backend developer' },
    summary: 'Builds payment APIs.',
    experience: [
      {
        company: 'Example Co',
        role: 'Software Engineer',
        start: '2024-01',
        end: 'present',
        bullets: ['Built payment gateway integrations with webhooks'],
        tech: ['PHP', 'Laravel', 'MySQL'],
      },
    ],
    skills: { primary: ['PHP', 'Laravel', 'MySQL'] },
  }

  it('ignores a tailored CV that mentions an unrelated stack', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { skills: ['PHP', 'Laravel'], industries: ['fintech'] })
    await saveMasterCV(u.id, master)
    const before = await loadRoleSuggestions(u.id)

    const co = await makeCompany(u.id)
    const app = await makeApplication(u.id, (await makeJob(u.id, co.id)).id)
    await docsQ.create(u.id, {
      applicationId: app.id,
      kind: 'tailored_cv',
      version: 1,
      title: 'Tailored for a mobile role',
      content: {
        ...master,
        skills: { primary: ['Swift', 'SwiftUI', 'Kotlin', 'Flutter', 'Dart', 'Android', 'iOS'] },
        experience: [{ ...master.experience[0]!, tech: ['Swift', 'Kotlin', 'Flutter'], bullets: ['Shipped iOS and Android apps'] }],
      },
    })
    const after = await loadRoleSuggestions(u.id)
    expect(after).toEqual(before)
    expect(after.suggestions.map((s) => s.family)).not.toContain('mobile')
    expect(after.suggestions.map((s) => s.id)).toEqual(expect.arrayContaining(['backend_php', 'payments']))
  })
})
