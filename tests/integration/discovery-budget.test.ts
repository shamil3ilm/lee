import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, isNull } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db, pgliteClient } from '@/lib/db/client'
import { discoveries as discTable } from '@/lib/db/schema'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import { MAX_SCORED_PER_SOURCE, runDiscoveryCycleForUser } from '@/lib/discovery/service'
import * as adapters from '@/lib/discovery/adapters'
import type { DiscoveryAdapter, DiscoveryItem } from '@/lib/discovery/adapters/types'

function jobItem(i: number): DiscoveryItem {
  return {
    sourceItemId: `gh-${i}`,
    raw: { id: i },
    normalized: {
      kind: 'job',
      title: `Engineer ${i}`,
      companyName: 'Acme',
      companyDomain: 'acme.com',
      remoteType: 'remote',
      employmentType: 'fulltime',
      descriptionMd: 'Build things.',
      applyUrl: `https://boards.greenhouse.io/acme/jobs/${i}`,
      techStack: ['typescript'],
      raw: {},
    },
  }
}

function stubAdapter(items: DiscoveryItem[], delayMs = 0): { calls: number } {
  const state = { calls: 0 }
  const fake: DiscoveryAdapter = {
    kind: 'greenhouse',
    async fetch() {
      state.calls += 1
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      return items
    },
  }
  vi.spyOn(adapters, 'getAdapter').mockImplementation((k: string) => (k === 'greenhouse' ? fake : null))
  return state
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

async function setup(): Promise<string> {
  const u = await makeUser()
  await profileQ.upsert(u.id, { headline: 'x', skills: ['ts', 'go'], industries: ['fintech'] })
  await sourcesQ.create(u.id, { name: 'Acme', kind: 'greenhouse', config: { company: 'acme' } })
  return u.id
}

describe('discovery cycle budget and scoring cap', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it(`scores at most ${MAX_SCORED_PER_SOURCE} items per source per run and ingests the rest unscored`, async () => {
    const userId = await setup()
    const items = Array.from({ length: MAX_SCORED_PER_SOURCE + 5 }, (_, i) => jobItem(i))
    stubAdapter(items)
    const scoreSpy = vi.fn(() => scoreResult)
    const r = await runDiscoveryCycleForUser({ userId, ai: new FixtureAIProvider({ scoreJob: scoreSpy }) })
    expect(r.newJobDiscoveries).toBe(items.length)
    expect(scoreSpy).toHaveBeenCalledTimes(MAX_SCORED_PER_SOURCE)
    const unscored = await db.select({ id: discTable.id }).from(discTable).where(isNull(discTable.matchScore))
    expect(unscored).toHaveLength(5)
  })

  it('re-scores rows a previous run left unscored, within the cap', async () => {
    const userId = await setup()
    const items = Array.from({ length: MAX_SCORED_PER_SOURCE + 5 }, (_, i) => jobItem(i))
    stubAdapter(items)
    const scoreSpy = vi.fn(() => scoreResult)
    const ai = new FixtureAIProvider({ scoreJob: scoreSpy })
    await runDiscoveryCycleForUser({ userId, ai })
    const second = await runDiscoveryCycleForUser({ userId, ai })
    expect(second.newJobDiscoveries).toBe(0)
    expect(scoreSpy).toHaveBeenCalledTimes(items.length)
    const unscored = await db.select({ id: discTable.id }).from(discTable).where(isNull(discTable.matchScore))
    expect(unscored).toHaveLength(0)
    // Nothing left to score: a third run makes no AI call.
    await runDiscoveryCycleForUser({ userId, ai })
    expect(scoreSpy).toHaveBeenCalledTimes(items.length)
  })

  it('a re-poll of already-seen items costs a constant number of queries, not two per item', async () => {
    const userId = await setup()
    const items = Array.from({ length: 25 }, (_, i) => jobItem(i))
    stubAdapter(items)
    const ai = new FixtureAIProvider({ scoreJob: () => scoreResult })
    await runDiscoveryCycleForUser({ userId, ai })

    const client = pgliteClient!
    const spy = vi.spyOn(client, 'query')
    await runDiscoveryCycleForUser({ userId, ai })
    const sqls = spy.mock.calls.map((c) => String(c[0]))
    spy.mockRestore()
    // Before: one INSERT … ON CONFLICT plus one SELECT of the full row
    // (raw + normalized jsonb) per item → 50+ queries for 25 items.
    expect(sqls.length).toBeLessThan(15)
    expect(sqls.filter((s) => /insert into "discoveries"/i.test(s))).toHaveLength(0)
    expect(sqls.some((s) => /"discoveries"\."raw"|"raw"/.test(s) && /select/i.test(s))).toBe(false)
  })

  it('does not start any source once the deadline has passed', async () => {
    const userId = await setup()
    const state = stubAdapter([jobItem(1)])
    const r = await runDiscoveryCycleForUser({
      userId,
      ai: new FixtureAIProvider(),
      deadline: Date.now() - 1,
    })
    expect(state.calls).toBe(0)
    expect(r.sourcesPolled).toBe(0)
    expect(r.budgetExhausted).toBe(true)
  })

  it('stops AI scoring when the deadline passes mid-source but keeps the ingested rows', async () => {
    const userId = await setup()
    stubAdapter([jobItem(1), jobItem(2)], 60)
    const scoreSpy = vi.fn(() => scoreResult)
    const r = await runDiscoveryCycleForUser({
      userId,
      ai: new FixtureAIProvider({ scoreJob: scoreSpy }),
      deadline: Date.now() + 20,
    })
    expect(r.newJobDiscoveries).toBe(2)
    expect(r.budgetExhausted).toBe(true)
    expect(scoreSpy).not.toHaveBeenCalled()
    const rows = await db.select().from(discTable).where(eq(discTable.userId, userId))
    expect(rows).toHaveLength(2)
  })
})
