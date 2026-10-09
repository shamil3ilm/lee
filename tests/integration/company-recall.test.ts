import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companyDiscoveries, discoveries, sources } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import { runCompanyDiscovery, ensureLocalCompaniesSource, storeCandidates } from '@/lib/company-discovery/service'
import { enrichPending } from '@/lib/company-discovery/enrich'
import { refreshGrowth } from '@/lib/company-discovery/growth/refresh'
import { candidateFromChoice } from '@/lib/company-discovery/search'
import { parseCursors } from '@/lib/company-discovery/cursors'
import { companyLimiter } from '@/lib/company-discovery/http'
import { expireStaleDiscoveries } from '@/lib/db/retention/discoveries'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'
import { fakeFetch, ROBOTS_ALLOW_ALL, type FakeRoute } from '@/tests/fixtures/company-discovery'
import { CYBERPARK_PAGE, INFOPARK_PAGE_1, TECHNOPARK_PAGES, UL_CYBERPARK_PAGE, technoparkProfile } from '@/tests/fixtures/company-discovery/recall'

const NOW = new Date('2026-10-09T09:00:00Z')
const SKIP_NETWORK_EXTRAS = ['github', 'wikidata', 'yc'] as const

function parkRoutes(opts: { failTechnoparkPage?: number } = {}): FakeRoute[] {
  return [
    {
      match: (u) => u.host === 'technopark.in' && u.pathname === '/api/paginated-companies' && Number(u.searchParams.get('page')) === opts.failTechnoparkPage,
      body: 'busy',
      status: 503,
    },
    { match: (u) => u.host === 'technopark.in' && u.pathname === '/api/paginated-companies', body: '' },
    { match: (u) => u.host === 'technopark.in' && u.pathname === '/company-details/6254', body: technoparkProfile('Good Methods Software Solutions (P) Ltd', 'http://www.carestack.com') },
    { match: (u) => u.host === 'technopark.in' && u.pathname === '/company-details/6092', body: technoparkProfile('QBurst Technologies (P) Ltd', 'http://www.qburst.com') },
    { match: (u) => u.host === 'technopark.in' && u.pathname.startsWith('/company-details/'), body: technoparkProfile('Example', null) },
    { match: (u) => u.host === 'infopark.in' && !u.searchParams.get('page'), body: INFOPARK_PAGE_1 },
    { match: (u) => u.host === 'infopark.in', body: '<html><body></body></html>' },
    { match: (u) => u.host === 'cyberparks.in', body: CYBERPARK_PAGE },
    { match: (u) => u.host === 'www.ulcyberpark.com', body: UL_CYBERPARK_PAGE },
    { match: (u) => u.host === 'nasscom.in', body: '<html><body></body></html>' },
    { match: (u) => u.pathname === '/robots.txt', body: ROBOTS_ALLOW_ALL, type: 'text/plain' },
  ]
}

/** Technopark answers per page from the fixture (JSON); everything else from the routes. */
function network(opts: { failTechnoparkPage?: number } = {}): typeof fetch & { calls: string[] } {
  const base = fakeFetch(parkRoutes(opts))
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(href)
    const page = Number(u.searchParams.get('page'))
    if (u.host === 'technopark.in' && u.pathname === '/api/paginated-companies' && page !== opts.failTechnoparkPage && TECHNOPARK_PAGES[page]) {
      base.calls.push(href)
      return new Response(JSON.stringify(TECHNOPARK_PAGES[page]), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return base(input, init)
  }
  return Object.assign(impl as typeof fetch, { calls: base.calls })
}

async function keralaUser() {
  const u = await makeUser()
  await profileQ.upsert(u.id, { targetRegions: ['kerala'], roleTypes: ['backend'], searchPrefsSavedAt: NOW })
  return u
}

const nameOf = (r: { normalized: unknown }) => String((r.normalized as { name?: unknown }).name)
const rowsOf = (userId: string) => db.select().from(companyDiscoveries).where(eq(companyDiscoveries.userId, userId))

beforeEach(() => {
  vi.spyOn(companyLimiter, 'wait').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recall regression: the full Technopark list (CareStack, QBurst)', () => {
  it('reads every page, and both companies end up tagged Thiruvananthapuram → Kerala → India', async () => {
    const u = await keralaUser()
    const net = network()
    // No seed: the park list alone must find them.
    const s = await runCompanyDiscovery(u.id, { fetchImpl: net, limiter: NO_WAIT, githubToken: null, now: NOW, skip: [...SKIP_NETWORK_EXTRAS, 'seed'] })
    expect(s.failed).toBe(0)
    const pagesRead = net.calls.filter((c) => c.includes('paginated-companies')).map((c) => Number(new URL(c).searchParams.get('page')))
    expect(pagesRead).toEqual([1, 2, 3])

    const all = await rowsOf(u.id)
    const carestack = all.find((r) => nameOf(r) === 'CareStack')!
    const qburst = all.find((r) => /qburst/i.test(nameOf(r)))!
    for (const r of [carestack, qburst]) {
      expect(r.regionIds).toEqual(expect.arrayContaining(['thiruvananthapuram', 'kerala', 'in']))
      expect(r.sourceTags).toContain('directory:technopark')
    }
    // CareStack is listed under its legal name; the alias gives it its website, so it dedupes by domain.
    expect(carestack).toMatchObject({ domain: 'carestack.com', evidence: expect.objectContaining({ listedAs: 'Good Methods Software Solutions (P) Ltd' }) })
    // QBurst from three parks is one company with every office.
    expect(all.filter((r) => /qburst/i.test(nameOf(r)))).toHaveLength(1)
    expect(qburst.domain).toBe('qburst.com')
    expect(qburst.sourceTags).toEqual(expect.arrayContaining(['directory:technopark', 'directory:infopark', 'directory:ul-cyberpark']))
    expect(qburst.regionIds).toEqual(expect.arrayContaining(['thiruvananthapuram', 'kochi', 'kozhikode']))
    // The inactive listing is skipped; every small firm on the lists is kept.
    expect(all.map(nameOf)).toEqual(expect.arrayContaining(['Alpha Example Systems (P) Ltd', 'Zeta Example Analytics', 'Malabar Code Example Private Limited', 'Calicut Soft Example']))
    expect(all.map(nameOf)).not.toContain('Gamma Closed Example Ltd')

    // A full pass is recorded on the cursor.
    const source = await ensureLocalCompaniesSource(u.id)
    expect(parseCursors(source.config)['dir:technopark']).toEqual({ next: 1, lastPage: 3, completedAt: NOW.toISOString() })
  })

  it('a run that fails mid-list resumes at the failed page next time', async () => {
    const u = await keralaUser()
    const first = await runCompanyDiscovery(u.id, { fetchImpl: network({ failTechnoparkPage: 2 }), limiter: NO_WAIT, githubToken: null, now: NOW, skip: [...SKIP_NETWORK_EXTRAS, 'seed'] })
    expect(first.sources.find((x) => x.source === 'directories')?.error).toMatch(/technopark/)
    expect((await rowsOf(u.id)).some((r) => nameOf(r) === 'CareStack')).toBe(false)
    const net = network()
    await runCompanyDiscovery(u.id, { fetchImpl: net, limiter: NO_WAIT, githubToken: null, now: NOW, skip: [...SKIP_NETWORK_EXTRAS, 'seed'] })
    const pages = net.calls.filter((c) => c.includes('paginated-companies')).map((c) => Number(new URL(c).searchParams.get('page')))
    expect(pages.slice(0, 2)).toEqual([2, 3])
    expect((await rowsOf(u.id)).some((r) => nameOf(r) === 'CareStack')).toBe(true)
  })

  it('enrichment reads a name-only listing’s park profile for its website, then folds it into the row with that website', async () => {
    const u = await keralaUser()
    await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW, skip: [...SKIP_NETWORK_EXTRAS, 'seed'] })
    // A second, name-only row for the same website, as an older run could have left.
    const source = await ensureLocalCompaniesSource(u.id)
    await companiesQ.upsertCompanies(u.id, source.id, [
      {
        sourceCompanyId: 'n:qburstkochiexample:in',
        name: 'QBurst Kochi Example',
        website: null,
        domain: null,
        regionIds: ['thiruvananthapuram', 'kerala', 'in'],
        industry: [],
        sizeBand: null,
        stage: null,
        sourceTags: ['directory:technopark'],
        evidence: { profileUrl: 'https://technopark.in/company-details/6092' },
        normalized: { kind: 'company', name: 'QBurst Kochi Example' },
      },
    ])
    await enrichPending(u.id, { fetchImpl: network(), limiter: NO_WAIT, limit: 100, countOpenRoles: async () => null })
    const all = await rowsOf(u.id)
    expect(all.filter((r) => r.domain === 'qburst.com')).toHaveLength(1)
    expect(all.some((r) => nameOf(r) === 'QBurst Kochi Example')).toBe(false)
  })

  it('local companies never auto-expire (a directory, not an inbox)', async () => {
    const u = await keralaUser()
    await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW, skip: [...SKIP_NETWORK_EXTRAS, 'seed'] })
    await db.update(companyDiscoveries).set({ createdAt: new Date('2025-01-01T00:00:00Z') }).where(eq(companyDiscoveries.userId, u.id))
    await expireStaleDiscoveries(NOW, { userId: u.id })
    expect((await rowsOf(u.id)).every((r) => r.status === 'new')).toBe(true)
  })
})

describe('employers seen in jobs become companies', () => {
  it('links every posting employer, with the job location as its place and the polled board as its job board', async () => {
    const u = await keralaUser()
    const gh = await makeSource(u.id, { name: 'Lagoon Labs (Greenhouse)', kind: 'greenhouse', config: { company: 'lagoonlabs' } })
    const alerts = await makeSource(u.id, { name: 'Job alerts', kind: 'email_alert', config: {} })
    for (const days of [2, 5, 9]) {
      await makeDiscovery(u.id, gh.id, {
        normalized: { kind: 'job', title: 'Backend Engineer', companyName: 'Lagoon Labs Example', location: 'Kochi, Kerala, India', applyUrl: 'https://boards.greenhouse.io/lagoonlabs/jobs/1' },
        regionIds: ['kochi', 'kerala', 'in'],
        createdAt: new Date(NOW.getTime() - days * 86_400_000),
      })
    }
    await makeDiscovery(u.id, alerts.id, { normalized: { kind: 'job', title: 'PHP Developer', companyName: 'Harbour Ledger Example', location: 'Doha, Qatar' } })
    await makeDiscovery(u.id, alerts.id, { normalized: { kind: 'job', title: 'Sales', companyName: 'Confidential' } })
    const s = await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW, skip: [...SKIP_NETWORK_EXTRAS, 'seed', 'directories'] })
    expect(s.sources.find((x) => x.source === 'jobs')?.fetched).toBe(2)
    const all = await rowsOf(u.id)
    const lagoon = all.find((r) => nameOf(r) === 'Lagoon Labs Example')!
    expect(lagoon).toMatchObject({ atsKind: 'greenhouse', atsSlug: 'lagoonlabs', watch: 'jobs', watchSourceId: gh.id, sourceTags: ['jobs'] })
    expect(lagoon.regionIds).toEqual(expect.arrayContaining(['kochi', 'kerala', 'in']))
    expect(lagoon.evidence).toMatchObject({ jobsSeen: 3, jobsRecent30: 3 })
    expect(all.find((r) => nameOf(r) === 'Harbour Ledger Example')!.regionIds).toEqual(expect.arrayContaining(['doha', 'qa']))
    expect(all.some((r) => nameOf(r) === 'Confidential')).toBe(false)
  })
})

describe('growth: refresh, ranking, sort and filters, job postings', () => {
  it('scores growth from facts, ranks the small rising company first, flags it under the radar, and copies growth onto its postings', async () => {
    const u = await keralaUser()
    const board = await makeSource(u.id, { name: 'Lagoon (Lever)', kind: 'lever', config: { company: 'lagoon-example' } })
    const posting = await makeDiscovery(u.id, board.id, {
      normalized: { kind: 'job', title: 'Backend Engineer', companyName: 'Lagoon Labs Example', location: 'Kochi' },
      regionIds: ['kochi', 'kerala', 'in'],
      fitScore: 60,
    })
    const other = await makeDiscovery(u.id, board.id, { normalized: { kind: 'job', title: 'Backend Engineer', companyName: 'Flat Example Corp', location: 'Kochi' }, regionIds: ['kochi', 'kerala', 'in'], fitScore: 61 })
    await storeCandidates(u.id, [
      { name: 'Lagoon Labs Example', regionIds: ['kochi'], industries: ['software'], sourceTags: ['jobs'], evidence: { githubLogin: 'lagoon-example' }, board: { kind: 'lever', slug: 'lagoon-example', url: 'https://jobs.lever.co/lagoon-example', sourceId: board.id } },
      { name: 'Flat Example Corp', website: 'https://flatcorp.example', regionIds: ['kochi'], industries: ['software'], sourceTags: ['wikidata'], evidence: { wikidataId: 'Q999002' } },
    ])
    const rows0 = await rowsOf(u.id)
    const lagoon0 = rows0.find((r) => nameOf(r) === 'Lagoon Labs Example')!
    const flat0 = rows0.find((r) => nameOf(r) === 'Flat Example Corp')!
    const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)
    await companiesQ.patchCompany(u.id, lagoon0.id, { roleSnapshots: [{ d: day(91), n: 3 }, { d: day(30), n: 5 }] as never })
    await companiesQ.patchCompany(u.id, flat0.id, { atsKind: 'lever', atsSlug: 'flat-example', roleSnapshots: [{ d: day(90), n: 40 }, { d: day(30), n: 41 }] as never })

    const weeks = [...Array(26).fill(1), ...Array(13).fill(2), ...Array(13).fill(9)]
    const fetchImpl = fakeFetch([
      { match: (x) => x.pathname === '/orgs/lagoon-example/repos', body: [{ name: 'api', created_at: day(20), pushed_at: day(1), stargazers_count: 2 }] },
      { match: (x) => x.pathname === '/repos/lagoon-example/api/stats/participation', body: { all: weeks } },
      { match: (x) => x.host === 'query.wikidata.org', body: { results: { bindings: [] } } },
      { match: (x) => x.host === 'api.gdeltproject.org', body: '' },
      { match: (x) => x.host === 'hn.algolia.com', body: { hits: [] } },
    ])
    const s = await refreshGrowth(u.id, { fetchImpl, limiter: NO_WAIT, now: NOW, countOpenRoles: async (_k, config) => ((config as { company?: string }).company === 'lagoon-example' ? 8 : 40) })
    expect(s.roleCounts).toBe(2)
    expect(s.github).toBe(1)

    const after = await rowsOf(u.id)
    const lagoon = after.find((r) => nameOf(r) === 'Lagoon Labs Example')!
    const flat = after.find((r) => nameOf(r) === 'Flat Example Corp')!
    expect(lagoon.growthScore!).toBeGreaterThanOrEqual(75)
    expect(lagoon.growthScore!).toBeGreaterThan(flat.growthScore ?? 0)
    expect(lagoon.roleSnapshots).toHaveLength(3)
    expect(lagoon.hiddenGem).toBe(true)
    expect(flat.hiddenGem).toBe(false)
    const signals = (lagoon.growthDetail as { signals: Array<{ kind: string; score: number | null; source: string }> }).signals
    expect(signals.find((x) => x.kind === 'hiring')).toMatchObject({ source: 'Lever job board, weekly counts' })
    expect(signals.find((x) => x.kind === 'news')!.score).toBeNull()

    // Sort by growth, minimum growth, under the radar.
    const byGrowth = await companiesQ.listCompanies(u.id, { status: 'new', sort: 'growth' })
    expect(nameOf(byGrowth[0]!)).toBe('Lagoon Labs Example')
    expect((await companiesQ.listCompanies(u.id, { status: 'new', minGrowth: 70 })).map(nameOf)).toEqual(['Lagoon Labs Example'])
    expect((await companiesQ.listCompanies(u.id, { status: 'new', gems: true })).map(nameOf)).toEqual(['Lagoon Labs Example'])

    // Postings carry their employer's growth; the Fit nudge only reorders when the user opts in.
    const [p] = await db.select().from(discoveries).where(eq(discoveries.id, posting.id))
    expect(p!.companyGrowth).toBe(lagoon.growthScore)
    const plain = await discoveriesQ.list(u.id, { status: 'new', sort: 'match' })
    expect(plain[0]!.id).toBe(other.id)
    const nudged = await discoveriesQ.list(u.id, { status: 'new', sort: 'match', growthInFit: true })
    expect(nudged[0]!.id).toBe(posting.id)
  })

  it('a company the user found with the search box is stored as "search" and queued for enrichment', async () => {
    const u = await keralaUser()
    const r = await storeCandidates(u.id, [candidateFromChoice({ name: 'Lagoon Labs Example', website: 'https://lagoonlabs.example', regionIds: ['kochi'], industries: ['software'], wikidataId: 'Q999001' }, NOW)])
    expect(r.new).toBe(1)
    const [row] = await rowsOf(u.id)
    expect(row).toMatchObject({ sourceTags: ['search'], domain: 'lagoonlabs.example', enrichStatus: 'pending' })
    // Adding it again updates the same row.
    expect((await storeCandidates(u.id, [candidateFromChoice({ name: 'Lagoon Labs', website: 'https://www.lagoonlabs.example', regionIds: [], industries: [] }, NOW)])).new).toBe(0)
    expect(await db.select().from(sources).where(eq(sources.userId, u.id))).toHaveLength(1)
  })
})
