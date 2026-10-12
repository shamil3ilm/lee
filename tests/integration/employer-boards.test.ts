import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { companyDiscoveries, discoveries } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discQ from '@/lib/db/queries/discoveries'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import { runDiscoveryForSource } from '@/lib/discovery/service'
import { storeCandidates } from '@/lib/company-discovery/service'
import { detectBoards, enableSuggestedBoards, suggestedBoardCounts } from '@/lib/company-discovery/boards'
import { boardFromUrl } from '@/lib/companies/ats-detect'
import type { CareersResult } from '@/lib/company-discovery/careers'
import { extractPost, type WpPost } from '@/lib/discovery/job-news/extract'
import { storeNewsLeads } from '@/lib/discovery/job-news/leads'
import { fakeBamboo } from '@/tests/fixtures/bamboohr/serve'

/**
 * End to end with fixtures (no network): the AIU BambooHR board → ingest →
 * tagged Kuwait through "Jahrah" → the gate keeps the IT, web and data
 * roles in New and filters the professor, dean and mandoub; the weekly
 * board auto-detect and job-news leads attach boards to companies, turned
 * on in starred regions and suggested elsewhere.
 */

const NOW = new Date('2026-10-12T09:00:00Z')

async function owner(starred: string[] = ['kw']) {
  const u = await makeUser()
  await profileQ.upsert(u.id, {
    targetRegions: ['gcc', 'kerala'],
    roleTypes: ['backend', 'fullstack', 'data_analyst'],
    seniorityLevels: ['junior', 'mid'],
    discoveryPrefs: { preferredRegions: starred.map((id) => ({ id, level: 'top' })) } as never,
    searchPrefsSavedAt: NOW,
  })
  return u
}

let original: typeof globalThis.fetch
beforeEach(() => {
  original = globalThis.fetch
  globalThis.fetch = fakeBamboo().fetch
})
afterEach(() => {
  globalThis.fetch = original
  vi.restoreAllMocks()
})

describe('AIU board → New', () => {
  it('ingests the board, tags Kuwait via Jahrah and keeps only the fitting roles', async () => {
    const u = await owner()
    const src = await sourcesQ.create(u.id, {
      name: 'American International University (BambooHR)',
      kind: 'bamboohr',
      config: { company: 'aiu', displayName: 'American International University' },
      enabled: true,
    })
    const r = await runDiscoveryForSource({ userId: u.id, sourceId: src.id, ai: new FixtureAIProvider() })
    expect(r.status).toBe('polled')
    expect(r.newJobDiscoveries).toBe(8)
    const rows = await db.select().from(discoveries).where(eq(discoveries.sourceId, src.id))
    const byId = new Map(rows.map((d) => [d.sourceJobId, d]))
    for (const id of ['475', '522', '523', '526']) {
      expect(byId.get(id)?.status, id).toBe('new')
      expect(byId.get(id)?.regionIds, id).toEqual(expect.arrayContaining(['jahra', 'kw', 'gcc']))
    }
    for (const id of ['494', '464', '527']) expect(byId.get(id)?.status, id).toBe('filtered')

    // Visible in New, with the local-hire chip data on the Application Developer.
    const inbox = await discQ.list(u.id, { status: 'new', limit: 50 })
    const dev = inbox.find((d) => d.sourceJobId === '475')
    expect(dev).toMatchObject({ title: 'Application Developer in Informational Technology (IT)', location: 'Jahrah, Kuwait', localHire: true, titleOnly: false })
    expect(inbox.find((d) => d.sourceJobId === '522')?.localHire).toBe(false)

    // The next run re-reads the list only: no detail call for stored openings.
    const second = fakeBamboo()
    globalThis.fetch = second.fetch
    await runDiscoveryForSource({ userId: u.id, sourceId: src.id, ai: new FixtureAIProvider() })
    expect(second.calls).toEqual(['https://aiu.bamboohr.com/careers/list'])
  })
})

function found(url: string): (website: string) => Promise<CareersResult> {
  return async () => ({ status: 'found', careersUrl: url, board: boardFromUrl(url), emails: [], textHash: null, fetched: 2 })
}

describe('employer-board auto-detect', () => {
  it('turns a found board on in a starred region and suggests it elsewhere', async () => {
    const u = await owner(['kw'])
    await storeCandidates(u.id, [
      { name: 'American International University', website: 'https://www.aiu.edu.kw', regionIds: ['jahra'], industries: [], sourceTags: ['seed'], evidence: {} },
      { name: 'Example Clinic Dubai', website: 'https://clinic.example', regionIds: ['dubai'], industries: [], sourceTags: ['seed'], evidence: {} },
    ])
    const find = vi.fn(async (website: string) =>
      website.includes('aiu') ? found('https://aiu.bamboohr.com/careers')(website) : found('https://clinicdxb.bamboohr.com/careers')(website),
    )
    const s = await detectBoards(u.id, { find, now: NOW })
    expect(s).toMatchObject({ checked: 2, found: 2, autoEnabled: 1, suggested: 1, byKind: { bamboohr: 2 } })

    const rows = await db.select().from(companyDiscoveries).where(eq(companyDiscoveries.userId, u.id))
    const aiu = rows.find((r) => r.domain === 'aiu.edu.kw')!
    expect(aiu).toMatchObject({ atsKind: 'bamboohr', atsSlug: 'aiu', watch: 'jobs' })
    expect((aiu.evidence as { boardFound?: { auto?: boolean } }).boardFound?.auto).toBe(true)
    const source = (await sourcesQ.list(u.id)).find((x) => x.id === aiu.watchSourceId)!
    expect(source).toMatchObject({ kind: 'bamboohr', enabled: true })
    expect(source.config).toMatchObject({ company: 'aiu', displayName: 'American International University' })

    const clinic = rows.find((r) => r.domain === 'clinic.example')!
    expect(clinic).toMatchObject({ atsKind: 'bamboohr', watch: null })
    expect((await suggestedBoardCounts(u.id, ['ae', 'kw'])).get('ae')?.count).toBe(1)

    // Checked this week: not re-checked until the week is over.
    expect((await detectBoards(u.id, { find, now: NOW })).checked).toBe(0)

    // "1 employer board found in UAE — turn on".
    const on = await enableSuggestedBoards(u.id, 'ae')
    expect(on.enabled).toBe(1)
    const [after] = await db.select().from(companyDiscoveries).where(and(eq(companyDiscoveries.userId, u.id), eq(companyDiscoveries.domain, 'clinic.example')))
    expect(after?.watch).toBe('jobs')
  })

  it('a job-news post becomes a Kuwait lead with its board, read at once in a starred region', async () => {
    const u = await owner(['kw'])
    const posts = JSON.parse(readFileSync(join(__dirname, '../fixtures/job-news/posts.json'), 'utf8')) as WpPost[]
    const facts = posts.map((p) => extractPost(p, { siteHost: 'www.pravasinewsdaily.com', countryCategories: { '3': 'AE', '47': 'KW' } }))
    const r = await storeNewsLeads(u.id, facts, { url: 'https://www.pravasinewsdaily.com', siteName: 'Pravasi News Daily', siteKey: 'pravasinewsdaily' }, NOW)
    expect(r.leads).toBe(3)
    expect(r.enabled).toBe(1)
    const rows = await companiesQ.listCompanies(u.id, { status: 'all', limit: 50 })
    const aiu = rows.find((x) => x.domain === 'aiu.edu.kw')!
    expect(aiu).toMatchObject({ atsKind: 'bamboohr', atsSlug: 'aiu', watch: 'jobs', sourceTags: ['news:pravasinewsdaily'] })
    expect(aiu.regionIds).toEqual(expect.arrayContaining(['kw', 'gcc']))
    expect((aiu.evidence as { seenOn?: string[] }).seenOn).toEqual(['Pravasi News Daily'])
    // A UAE lead with only a website: stored for the weekly auto-detect, not turned on.
    const crescent = rows.find((x) => x.domain === 'crescentenergy.example')!
    expect(crescent).toMatchObject({ watch: null, atsKind: null })
  })
})
