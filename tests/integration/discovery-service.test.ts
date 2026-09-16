import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { applications, companies, discoveries as discTable, sources } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import {
  runDiscoveryCycleForUser,
  promoteJobDiscovery,
  promoteCompanyDiscovery,
  dismissDiscovery,
} from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem } from '@/lib/discovery/adapters/types'

// Helper: swap in a fake adapter registered under a real kind key.
function stubAdapter(kind: string, items: DiscoveryItem[]): void {
  const fake: DiscoveryAdapter = {
    kind,
    async fetch() {
      return items
    },
  }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) =>
    k === kind ? fake : null,
  )
}

const jobItem: DiscoveryItem = {
  sourceItemId: 'gh-1',
  raw: { id: 'gh-1' },
  normalized: {
    kind: 'job',
    title: 'Senior Backend Engineer',
    companyName: 'Acme',
    companyDomain: 'acme.com',
    location: 'Remote',
    remoteType: 'remote',
    employmentType: 'fulltime',
    descriptionMd: 'Build our platform.',
    applyUrl: 'https://boards.greenhouse.io/acme/jobs/gh-1',
    techStack: ['typescript', 'postgres'],
    raw: {},
  },
}

const companyItem: DiscoveryItem = {
  sourceItemId: 'yc-1',
  raw: { id: 'yc-1' },
  normalized: {
    kind: 'company',
    name: 'Beta',
    domain: 'beta.io',
    industry: ['Fintech'],
    size: '11-50',
    stage: 'Seed',
    raw: {},
  },
}

describe('runDiscoveryCycleForUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('polls enabled sources, upserts items, scores new ones', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'Senior BE', skills: ['typescript'] })
    const src = await sourcesQ.create(u.id, {
      name: 'Acme GH',
      kind: 'greenhouse',
      config: { company: 'acme' },
    })
    stubAdapter('greenhouse', [jobItem])

    const ai = new FixtureAIProvider()
    const r = await runDiscoveryCycleForUser({ userId: u.id, ai })
    expect(r.sourcesPolled).toBe(1)
    expect(r.newJobDiscoveries).toBe(1)
    expect(r.newCompanyDiscoveries).toBe(0)

    const rows = await db.select().from(discTable).where(eq(discTable.userId, u.id))
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row!.matchScore).not.toBeNull()
    expect(row!.status).toBe('new')

    const s = await sourcesQ.getById(u.id, src.id)
    expect(s?.lastPolledAt).toBeInstanceOf(Date)
    expect(s?.errorCount).toBe(0)
  })

  it('does not re-score on second poll', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'x', skills: [] })
    await sourcesQ.create(u.id, {
      name: 'Acme',
      kind: 'greenhouse',
      config: { company: 'acme' },
    })
    stubAdapter('greenhouse', [jobItem])

    const scoreSpy = vi.fn(() => ({
      match_score: 77,
      strengths: [],
      red_flags: [],
      reasoning: '',
      location_match: 'remote' as const,
      seniority_match: 'match' as const,
      stack_overlap: [],
      stack_gaps: [],
      industry_match: 'weak' as const,
    }))
    const ai = new FixtureAIProvider({ scoreJob: scoreSpy })
    await runDiscoveryCycleForUser({ userId: u.id, ai })
    await runDiscoveryCycleForUser({ userId: u.id, ai })
    expect(scoreSpy).toHaveBeenCalledTimes(1) // only for the first (fresh) upsert
  })

  it('records error and bumps errorCount on adapter failure', async () => {
    const u = await makeUser()
    const src = await sourcesQ.create(u.id, {
      name: 'Broken',
      kind: 'greenhouse',
      config: { company: 'x' },
    })
    vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => {
      if (k === 'greenhouse') {
        return {
          kind: 'greenhouse',
          async fetch() {
            throw new Error('boom')
          },
        }
      }
      return null
    })
    const ai = new FixtureAIProvider()
    const r = await runDiscoveryCycleForUser({ userId: u.id, ai })
    expect(r.errors.length).toBe(1)
    const after = await sourcesQ.getById(u.id, src.id)
    expect(after?.errorCount).toBe(1)
    expect(after?.lastError).toMatch(/boom/)
  })
})

describe('promoteJobDiscovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates company + job + application and marks discovery saved', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'BE', skills: ['typescript'] })
    await sourcesQ.create(u.id, {
      name: 'Acme',
      kind: 'greenhouse',
      config: { company: 'acme' },
    })
    stubAdapter('greenhouse', [jobItem])
    await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })

    const [disc] = await db.select().from(discTable).where(eq(discTable.userId, u.id))
    const r = await promoteJobDiscovery({ userId: u.id, discoveryId: disc!.id })
    expect(r.application.status).toBe('saved')
    expect(r.discovery.status).toBe('saved')
    expect(r.discovery.savedApplicationId).toBe(r.application.id)

    const c = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, u.id), eq(companies.domain, 'acme.com')))
    expect(c).toHaveLength(1)

    const a = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, u.id))
    expect(a).toHaveLength(1)
  })
})

describe('promoteCompanyDiscovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // ATS detection happens inside addWatchedCompany; short-circuit it.
    global.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
  })

  it('watches company and marks company_discovery saved', async () => {
    const u = await makeUser()
    await profileQ.upsert(u.id, { headline: 'x', industries: ['Fintech'] })
    await sourcesQ.create(u.id, {
      name: 'YC',
      kind: 'yc_directory',
      config: {},
    })
    stubAdapter('yc_directory', [companyItem])
    await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })

    // Find the created company discovery via a direct query — simpler than
    // adding a getById lookup in the test.
    const { companyDiscoveries } = await import('@/lib/db/schema')
    const [disc] = await db
      .select()
      .from(companyDiscoveries)
      .where(eq(companyDiscoveries.userId, u.id))
    expect(disc).toBeTruthy()

    const r = await promoteCompanyDiscovery({ userId: u.id, discoveryId: disc!.id })
    expect(r.discovery.status).toBe('saved')

    const rows = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, u.id), eq(companies.domain, 'beta.io')))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.isWatched).toBe(true)
  })
})

describe('dismissDiscovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sets status to dismissed', async () => {
    const u = await makeUser()
    await sourcesQ.create(u.id, {
      name: 'Acme',
      kind: 'greenhouse',
      config: { company: 'acme' },
    })
    stubAdapter('greenhouse', [jobItem])
    await runDiscoveryCycleForUser({ userId: u.id, ai: new FixtureAIProvider() })
    const [disc] = await db.select().from(discTable).where(eq(discTable.userId, u.id))
    await dismissDiscovery({ userId: u.id, discoveryId: disc!.id })
    const [after] = await db.select().from(discTable).where(eq(discTable.id, disc!.id))
    expect(after!.status).toBe('dismissed')
  })
})

// Ensure listAdapterKinds still returns all 9 (guard against accidental
// registry regressions).
describe('adapter registry', () => {
  it('exposes all 9 adapter kinds', () => {
    expect(adapters.listAdapterKinds().sort()).toEqual(
      [
        'ashby',
        'greenhouse',
        'hn_whoishiring',
        'jsonld',
        'lever',
        'remoteok',
        'rss',
        'workable',
        'yc_directory',
      ].sort(),
    )
  })
})

// Unused sources import kept so lint doesn't fail on the intentional module
// reference used elsewhere in the file.
void sources
