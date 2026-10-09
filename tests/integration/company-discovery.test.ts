import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, companyDiscoveries, queueJobs, sources } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import { runCompanyDiscovery, storeCandidates, MAX_COMPANIES_PER_USER, NEW_PER_SOURCE } from '@/lib/company-discovery/service'
import { enrichPending, checkWatchedCareers } from '@/lib/company-discovery/enrich'
import { dismissCompany, trackSpeculative, watchCareers, watchJobs } from '@/lib/company-discovery/actions'
import { draftReachOut } from '@/lib/company-discovery/reach-out'
import { companyLimiter } from '@/lib/company-discovery/http'
import { findFollowupCandidates } from '@/lib/followups/service'
import { tombstoneDismissedDiscoveries } from '@/lib/db/retention/discoveries'
import { saveMasterCV } from '@/lib/documents/master'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { makeUser } from '@/tests/factories'
import {
  CAREERS_PAGE,
  GITHUB_ORGS_KUWAIT,
  GITHUB_ORG_DEVHOUSE,
  GITHUB_REPOS_DEVHOUSE,
  HOME_WITH_BOARD,
  HOME_WITH_CAREERS_LINK,
  QSTP_DIRECTORY,
  ROBOTS_ALLOW_ALL,
  ROBOTS_DISALLOW_ALL,
  TECHNOPARK_PAGE,
  WIKIDATA_AE,
  WIKIDATA_KW,
  YC_ALL,
  fakeFetch,
  type FakeRoute,
} from '@/tests/fixtures/company-discovery'

const NOW = new Date('2026-10-09T09:00:00Z')

/** OpenStreetMap in Kuwait City: a hospital (a non-tech employer) and a restaurant (dropped). */
const OVERPASS_INTEGRATION = {
  elements: [
    { type: 'way', id: 9001, center: { lat: 29.37, lon: 47.98 }, tags: { amenity: 'hospital', name: 'Example General Hospital' } },
    { type: 'node', id: 9002, lat: 29.37, lon: 47.98, tags: { amenity: 'restaurant', name: 'Example Grill' } },
  ],
}

/** GLEIF in Kuwait: Dinar Pay under its legal name (must fold into the known company). */
const GLEIF_INTEGRATION = {
  meta: { pagination: { currentPage: 1, lastPage: 1, total: 1 } },
  data: [
    {
      type: 'lei-records',
      id: '5493000EXAMPLE000077',
      attributes: {
        lei: '5493000EXAMPLE000077',
        entity: {
          legalName: { name: 'Dinar Pay K.S.C.C.', language: 'en' },
          otherNames: [],
          transliteratedOtherNames: [],
          legalAddress: { city: 'Kuwait City', country: 'KW', addressLines: [] },
          headquartersAddress: { city: 'Kuwait City', country: 'KW', addressLines: [] },
          category: 'GENERAL',
          status: 'ACTIVE',
        },
      },
    },
  ],
}

function routes(): FakeRoute[] {
  return [
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/search/users' && (u.searchParams.get('q') ?? '').includes('Kuwait'), body: GITHUB_ORGS_KUWAIT },
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/search/users', body: { total_count: 0, items: [] } },
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/orgs/kw-devhouse', body: GITHUB_ORG_DEVHOUSE },
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/orgs/kw-devhouse/repos', body: GITHUB_REPOS_DEVHOUSE },
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/orgs/dinarpay', body: { login: 'dinarpay', public_repos: 3 } },
    { match: (u) => u.host === 'api.github.com' && u.pathname === '/orgs/dinarpay/repos', body: [{ language: 'PHP' }] },
    { match: (u) => u.host === 'yc-oss.github.io', body: YC_ALL },
    { match: (u) => u.host === 'technopark.in', body: TECHNOPARK_PAGE },
    { match: (u) => u.host === 'qstp.qa', body: QSTP_DIRECTORY },
    // The other park, accelerator and member lists answer with empty pages here (tests/integration/company-recall.test.ts reads them).
    { match: (u) => ['infopark.in', 'cyberparks.in', 'www.ulcyberpark.com', 'nasscom.in', 'startupbahrain.com'].includes(u.host), body: '<html><body></body></html>' },
    { match: (u) => u.host === 'flat6labs.com', body: '<urlset></urlset>', type: 'application/xml' },
    // Company sites.
    { match: (u) => u.host === 'www.dinarpay.example' && u.pathname === '/robots.txt', body: ROBOTS_ALLOW_ALL, type: 'text/plain' },
    { match: (u) => u.host === 'www.dinarpay.example' && u.pathname === '/', body: HOME_WITH_BOARD },
    { match: (u) => u.host === 'kwdevhouse.example' && u.pathname === '/robots.txt', body: ROBOTS_ALLOW_ALL, type: 'text/plain' },
    { match: (u) => u.host === 'kwdevhouse.example' && u.pathname === '/', body: HOME_WITH_CAREERS_LINK },
    { match: (u) => u.host === 'kwdevhouse.example' && u.pathname === '/en/join-us', body: CAREERS_PAGE },
    { match: (u) => u.pathname === '/robots.txt', body: ROBOTS_DISALLOW_ALL, type: 'text/plain' },
  ]
}

/** Wikidata answers per country group (the query names the place QIDs); the rest from the routes. */
function network(): typeof fetch & { calls: string[] } {
  const base = fakeFetch(routes())
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(href)
    if (u.host === 'overpass-api.de') {
      base.calls.push(href)
      return new Response(JSON.stringify(OVERPASS_INTEGRATION), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (u.host === 'api.gleif.org') {
      base.calls.push(href)
      const kw = u.searchParams.get('filter[entity.legalAddress.country]') === 'KW'
      return new Response(JSON.stringify(kw ? GLEIF_INTEGRATION : { meta: { pagination: { lastPage: 1, total: 0 } }, data: [] }), { status: 200, headers: { 'content-type': 'application/vnd.api+json' } })
    }
    if (u.host === 'query.wikidata.org') {
      base.calls.push(href)
      const q = u.searchParams.get('query') ?? ''
      const body = q.includes('wd:Q817') ? WIKIDATA_KW : q.includes('wd:Q612') ? WIKIDATA_AE : { results: { bindings: [] } }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/sparql-results+json' } })
    }
    return base(input, init)
  }
  return Object.assign(impl as typeof fetch, { calls: base.calls })
}

async function setup() {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    targetRegions: ['ae', 'kw', 'qa', 'kerala'],
    roleTypes: ['backend', 'payments'],
    discoveryPrefs: { preferredRegions: [{ id: 'kw', level: 'top' }, { id: 'ae', level: 'top' }] } as never,
    searchPrefsSavedAt: NOW,
  })
  await linkedinQ.upsertConnections(u.id, [
    { name: 'Alex Sample', company: 'Dinar Pay', companyKey: 'dinar pay', position: 'Engineering Manager', connectedOn: '2025-01-01', email: null },
    { name: 'Rae Sample', company: 'Dinar Pay K.S.C.', companyKey: 'dinar pay', position: 'Product', connectedOn: '2025-02-01', email: null },
  ])
  return u
}

beforeEach(() => {
  vi.spyOn(companyLimiter, 'wait').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function rows(userId: string) {
  return db.select().from(companyDiscoveries).where(eq(companyDiscoveries.userId, userId))
}

const nameOf = (r: { normalized: unknown }) => String((r.normalized as { name?: unknown }).name)

describe('weekly company discovery', () => {
  it('collects from every source, dedupes across them, ranks with chips and queues enrichment', async () => {
    const u = await setup()
    const net = network()
    const s = await runCompanyDiscovery(u.id, { fetchImpl: net, limiter: NO_WAIT, githubToken: null, now: NOW })
    expect(s.failed).toBe(0)
    expect(s.sources.map((x) => x.source).sort()).toEqual(['directories', 'github', 'jobs', 'linkedin', 'map', 'register', 'seed', 'wikidata', 'yc'])
    const all = await rows(u.id)
    const names = all.map(nameOf).sort()
    // Dinar Pay came from Wikidata AND GitHub AND the user's connections: one row.
    expect(names.filter((n) => /dinar ?pay/i.test(n))).toHaveLength(1)
    expect(names).toEqual(expect.arrayContaining(['Dinar Pay', 'Gulf Ledger Bank', 'Falcon Invoicing', 'kw-devhouse', 'Kochi Ledger', 'Doha AI Example', 'Trivandrum Example Systems (P) Ltd']))
    const dinar = all.find((r) => nameOf(r) === 'Dinar Pay')!
    // GLEIF's legal name "Dinar Pay K.S.C.C." folded into the same row.
    expect(dinar.sourceTags.sort()).toEqual(['github', 'linkedin', 'register:gleif', 'wikidata'].sort())
    expect((dinar.evidence as { lei?: string }).lei).toBe('5493000EXAMPLE000077')
    // A non-tech employer from the map survives ingestion, marked by its source; the restaurant does not.
    const hospital = all.find((r) => nameOf(r) === 'Example General Hospital')!
    expect(hospital.sourceTags).toEqual(['map:osm'])
    expect(hospital.regionIds).toEqual(expect.arrayContaining(['kuwait-city', 'kw']))
    expect(names).not.toContain('Example Grill')
    expect(dinar.regionIds).toEqual(expect.arrayContaining(['kuwait-city', 'kw', 'gcc']))
    expect(dinar.domain).toBe('dinarpay.example')
    expect((dinar.evidence as { connections?: number }).connections).toBe(2)
    expect(dinar.enrichStatus).toBe('pending')
    const chips = (dinar.fitDetail as Array<{ label: string }>).map((c) => c.label)
    expect(chips).toEqual(expect.arrayContaining(['Region: Kuwait', 'Preferred: Kuwait', 'Warm intro: 2 connections']))
    const ministry = all.find((r) => nameOf(r) === 'Ministry of Example Services')!
    expect(ministry.fitScore!).toBeLessThanOrEqual(10)
    expect(dinar.fitScore!).toBeGreaterThan(ministry.fitScore!)
    // Only the companies' public lists were read; no company site yet (that is enrichment).
    expect(net.calls.some((c) => c.includes('dinarpay.example'))).toBe(false)

    // A second run inserts nothing new and keeps the user's choices.
    await dismissCompany(u.id, ministry.id, 'government')
    const again = await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW })
    expect(again.new).toBe(0)
    const ministryAfter = (await rows(u.id)).find((r) => r.id === ministry.id)!
    expect(ministryAfter.status).toBe('dismissed')
    expect(ministryAfter.dismissReason).toBe('government')
  })

  it('caps new rows per source per run and per user', async () => {
    const u = await setup()
    const many = Array.from({ length: NEW_PER_SOURCE.paste! + 15 }, (_, i) => ({
      name: `Paste Co ${i}`,
      website: `https://paste-co-${i}.example`,
      regionIds: ['dubai'],
      industries: [],
      sourceTags: ['paste'],
      evidence: {},
    }))
    const r = await storeCandidates(u.id, many)
    expect(r.new).toBe(NEW_PER_SOURCE.paste)
    expect(r.capped).toBe(15)
    // Room for complete park lists (hundreds each), still small for Neon Free (about 2 KB a row).
    expect(MAX_COMPANIES_PER_USER).toBeLessThanOrEqual(3000)
  })
})

describe('enrichment, watching and the speculative workflow', () => {
  it('finds boards and careers pages after robots.txt, then Watch jobs adds a source', async () => {
    const u = await setup()
    await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW })
    const net = network()
    const s = await enrichPending(u.id, { fetchImpl: net, limiter: NO_WAIT, limit: 200, countOpenRoles: async () => 3 })
    expect(s.checked).toBeGreaterThan(0)
    const all = await rows(u.id)
    const dinar = all.find((r) => nameOf(r) === 'Dinar Pay')!
    expect(dinar).toMatchObject({ atsKind: 'lever', atsSlug: 'dinarpay', careersUrl: 'https://jobs.lever.co/dinarpay', enrichStatus: 'done' })
    expect((dinar.evidence as { openRoles?: number; contactEmails?: string[] }).openRoles).toBe(3)
    expect((dinar.evidence as { contactEmails?: string[] }).contactEmails).toEqual(['careers@dinarpay.example'])
    expect((dinar.fitDetail as Array<{ label: string }>).map((c) => c.label)).toContain('Hiring: 3 open roles')

    const dev = all.find((r) => nameOf(r) === 'KW Devhouse')!
    expect(dev).toMatchObject({ website: 'https://kwdevhouse.example', careersUrl: 'https://kwdevhouse.example/en/join-us', atsKind: null })
    expect(dev.careersHash).toMatch(/^[0-9a-f]{16}$/)
    expect((dev.evidence as { languages?: string[] }).languages).toEqual(['PHP', 'TypeScript'])

    // Robots disallow everything on this site: blocked, and no page beyond robots.txt fetched.
    const bank = all.find((r) => nameOf(r) === 'Gulf Ledger Bank')!
    expect(bank.enrichStatus).toBe('blocked')
    expect(net.calls.filter((c) => c.includes('gulfledger.example'))).toEqual(['https://gulfledger.example/robots.txt'])

    const w = await watchJobs(u.id, dinar.id)
    expect(w.created).toBe(true)
    const [src] = await db.select().from(sources).where(eq(sources.id, w.sourceId))
    expect(src).toMatchObject({ kind: 'lever', enabled: true })
    expect((src!.config as { company?: string }).company).toBe('dinarpay')
    const polls = await db.select().from(queueJobs).where(and(eq(queueJobs.userId, u.id), eq(queueJobs.type, JOB_TYPES.discoverySource)))
    expect(polls.some((j) => (j.payload as { sourceId?: string }).sourceId === w.sourceId)).toBe(true)
    expect((await watchJobs(u.id, dinar.id)).created).toBe(false)

    const careers = await watchCareers(u.id, dev.id)
    expect(careers.changeDetection).toBe(true)
    const [watchSrc] = await db.select().from(sources).where(eq(sources.id, careers.sourceId))
    expect(watchSrc).toMatchObject({ kind: 'watch', enabled: false })

    // The weekly change check: a different page text adds a to-do.
    const changed = fakeFetch([
      { match: (x) => x.pathname === '/robots.txt', body: ROBOTS_ALLOW_ALL, type: 'text/plain' },
      { match: (x) => x.pathname === '/en/join-us', body: CAREERS_PAGE.replace('always looking', 'now hiring two') },
    ])
    expect(await checkWatchedCareers(u.id, { fetchImpl: changed, limiter: NO_WAIT }, NOW)).toEqual({ checked: 1, changed: 1 })
  })

  it('Reach out suggests only the user’s connections or published role addresses, and tracks a speculative application', async () => {
    const u = await setup()
    await saveMasterCV(u.id, {
      basics: { name: 'Sam Example', headline: 'Backend developer' },
      summary: '',
      experience: [{ company: 'Example Fintech', role: 'Backend Developer', start: '2023-01', end: 'present', bullets: ['Built payment gateway webhooks with retries in Laravel'] }],
      skills: { primary: ['Laravel', 'MySQL'] },
    })
    await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW })
    await enrichPending(u.id, { fetchImpl: network(), limiter: NO_WAIT, limit: 200, countOpenRoles: async () => null })
    const dinar = (await rows(u.id)).find((r) => nameOf(r) === 'Dinar Pay')!
    const plan = await draftReachOut(u.id, dinar.id, { ai: null })
    expect(plan.people.map((p) => p.name).sort()).toEqual(['Alex Sample', 'Rae Sample'])
    expect(plan.emails).toEqual(['careers@dinarpay.example'])
    expect(plan.draft.channel).toBe('linkedin')
    expect(plan.draft.body).toMatch(/^Hi (Alex|Rae),/)
    expect(plan.draft.body).toContain('Laravel')
    const email = await draftReachOut(u.id, dinar.id, { ai: null, channel: 'email' })
    expect(email.draft.to).toBeNull()

    const { applicationId } = await trackSpeculative(u.id, dinar.id, { channel: 'linkedin', to: null }, NOW)
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId))
    expect(app).toMatchObject({ status: 'speculative', source: 'speculative' })
    expect((await companiesQ.getCompany(u.id, dinar.id))?.applicationId).toBe(applicationId)
    // The follow-up cadence picks it up after five business days.
    const later = new Date('2026-10-19T09:00:00Z')
    expect((await findFollowupCandidates(u.id, later)).map((c) => c.applicationId)).toContain(applicationId)
  })

  it('a website only a map listed must pass the liveness check, else it is dropped (the company stays)', async () => {
    const u = await setup()
    await storeCandidates(u.id, [
      { name: 'Dead Site Example Trading', website: 'https://dead-site.example', regionIds: ['kuwait-city'], industries: [], sourceTags: ['map:osm'], evidence: { sector: 'retail' } },
      { name: 'KW Devhouse Map', website: 'https://kwdevhouse.example', regionIds: ['kuwait-city'], industries: [], sourceTags: ['map:osm'], evidence: { sector: 'it' } },
    ])
    await enrichPending(u.id, { fetchImpl: network(), limiter: NO_WAIT, limit: 200, countOpenRoles: async () => null })
    const all = await rows(u.id)
    const dead = all.find((r) => nameOf(r) === 'Dead Site Example Trading')!
    expect(dead).toMatchObject({ website: null, domain: null, enrichStatus: 'done' })
    expect(dead.evidence).toMatchObject({ siteLive: false, careersNote: 'The listed website did not answer.' })
    const live = all.find((r) => nameOf(r) === 'KW Devhouse Map')!
    expect(live).toMatchObject({ website: 'https://kwdevhouse.example', careersUrl: 'https://kwdevhouse.example/en/join-us' })
    expect((live.evidence as { siteLive?: boolean }).siteLive).toBe(true)
  })

  it('retention tombstones dismissed companies but keeps the dedupe key', async () => {
    const u = await setup()
    await runCompanyDiscovery(u.id, { fetchImpl: network(), limiter: NO_WAIT, githubToken: null, now: NOW })
    const target = (await rows(u.id)).find((r) => nameOf(r) === 'Falcon Invoicing')!
    await dismissCompany(u.id, target.id, null)
    await tombstoneDismissedDiscoveries(new Date(Date.now() + 400 * 86_400_000), { userId: u.id })
    const [after] = await db.select().from(companyDiscoveries).where(eq(companyDiscoveries.id, target.id))
    expect(after).toMatchObject({ status: 'dismissed', evidence: {}, fitDetail: null })
    expect(after!.sourceCompanyId).toBe(target.sourceCompanyId)
  })
})
