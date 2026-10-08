import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries as discTable } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as relQ from '@/lib/db/queries/discoveryRelevance'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { learnFromDiscoveries } from '@/lib/discovery/relevance/learn-service'
import { domainFilterReview } from '@/lib/discovery/relevance/review'
import { parseLearnedTitles } from '@/lib/discovery/relevance/learned'
import { makeUser } from '@/tests/factories'

/** Synthetic postings: generic employers, no real people. */
function job(id: string, title: string, descriptionMd: string): DiscoveryItem {
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName: 'Example Gulf Co',
    location: 'Dubai, UAE',
    remoteType: 'onsite',
    employmentType: 'fulltime',
    descriptionMd,
    applyUrl: `https://jobs.example.com/${id}`,
    techStack: [],
    raw: {},
  }
  return { sourceItemId: id, raw: { id }, normalized }
}

const ITEMS: DiscoveryItem[] = [
  job('marketing', 'Marketing Manager', 'Plan marketing campaigns and grow brand awareness.'),
  job('hr', 'HR Generalist', 'End-to-end recruitment, onboarding new hires and employee relations.'),
  job('legal', 'Legal Counsel', 'Litigation support and drafting contracts.'),
  job('backend', 'Backend Developer', '## Requirements\n- PHP and Laravel\n- MySQL'),
  job('data', 'Data Analyst', '## Requirements\n- SQL and Power BI dashboards\n- Excel'),
  job('ba', 'Business Analyst', 'Requirements gathering, BRD and UAT for our ERP rollout.'),
  job('odd', 'Talent Navigator', 'End-to-end recruitment and sourcing candidates.'),
]

const ai = new FixtureAIProvider({
  scoreJob: () => ({
    match_score: 60,
    strengths: [],
    red_flags: [],
    reasoning: '',
    location_match: 'priority_1' as const,
    seniority_match: 'match' as const,
    stack_overlap: [],
    stack_gaps: [],
    industry_match: 'weak' as const,
  }),
})

function stubAdapter(items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = { kind: 'remoteok', fetch: async () => items }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'remoteok' ? fake : null))
}

/** A profile with ready skills but NO saved search preferences. */
async function setup(): Promise<string> {
  const u = await makeUser()
  await profileQ.upsert(u.id, { headline: 'Developer', skills: ['PHP', 'Laravel', 'MySQL', 'SQL', 'Excel'] })
  await sourcesQ.create(u.id, { name: 'Feed', kind: 'remoteok', config: {} })
  return u.id
}

async function statuses(userId: string): Promise<Record<string, { status: string; reason: string | null }>> {
  const rows = await db
    .select({ id: discTable.sourceJobId, status: discTable.status, reason: discTable.filterReason })
    .from(discTable)
    .where(eq(discTable.userId, userId))
  return Object.fromEntries(rows.map((r) => [r.id, { status: r.status, reason: r.reason }]))
}

describe('domain filter before search preferences are saved', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('filters marketing, HR and legal postings and keeps engineering, data and analysis ones', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai })
    const s = await statuses(userId)
    expect(s['marketing']).toEqual({ status: 'filtered', reason: 'domain: Marketing' })
    expect(s['hr']).toEqual({ status: 'filtered', reason: 'domain: HR' })
    expect(s['legal']).toEqual({ status: 'filtered', reason: 'domain: Legal' })
    for (const k of ['backend', 'data', 'ba']) expect(s[k]?.status, k).toBe('new')
  })

  it('learns a title from "Show anyway" and applies it on the next ingest', async () => {
    const userId = await setup()
    stubAdapter(ITEMS)
    await runDiscoveryCycleForUser({ userId, ai })
    const [odd] = await db.select({ id: discTable.id }).from(discTable).where(eq(discTable.sourceJobId, 'odd'))
    await relQ.showAnyway(userId, [odd!.id])
    await learnFromDiscoveries(userId, [odd!.id], true, { requeue: false })
    expect(Object.keys(parseLearnedTitles((await profileQ.get(userId))!.learnedTitles))).toEqual(['talent navigator'])

    stubAdapter([job('odd-2', 'Senior Talent Navigator - Abu Dhabi', 'End-to-end recruitment and sourcing candidates.')])
    await runDiscoveryCycleForUser({ userId, ai })
    expect((await statuses(userId))['odd-2']?.status).toBe('new')
  })

  it('a "Not my field" title is filtered as unrelated next time', async () => {
    const userId = await setup()
    stubAdapter([job('ba', 'Business Analyst', 'Requirements gathering for our ERP rollout.')])
    await runDiscoveryCycleForUser({ userId, ai })
    const [ba] = await db.select({ id: discTable.id }).from(discTable).where(eq(discTable.sourceJobId, 'ba'))
    await learnFromDiscoveries(userId, [ba!.id], false, { requeue: false })
    stubAdapter([job('ba-2', 'Business Analyst II', 'Requirements gathering.')])
    await runDiscoveryCycleForUser({ userId, ai })
    expect((await statuses(userId))['ba-2']).toEqual({ status: 'filtered', reason: 'domain: not your field (you said so)' })
  })

  it('selects the weekly "Did we filter something useful?" review by title, with counts', async () => {
    const userId = await setup()
    stubAdapter([
      ...ITEMS,
      job('hr-2', 'HR Generalist - Riyadh', 'Recruitment and onboarding new hires.'),
      job('hr-3', 'Senior HR Generalist', 'Employee relations and recruitment.'),
    ])
    await runDiscoveryCycleForUser({ userId, ai })
    const review = await domainFilterReview(userId)
    expect(review[0]).toMatchObject({ key: 'hr generalist', domain: 'HR', count: 3 })
    expect(review.map((r) => r.key)).toEqual(expect.arrayContaining(['marketing manager', 'legal counsel']))
  })
})
