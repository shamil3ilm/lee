import { describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'
import * as discQ from '@/lib/db/queries/discoveries'
import { displayedFitSql } from '@/lib/db/queries/discoveries'
import { shownFit } from '@/lib/discovery/match/blend'
import { growthFitNudge } from '@/lib/company-discovery/growth/combine'
import { findNotifiableDiscoveries } from '@/lib/notifications/discovery'
import { gatherPipelineSnapshot } from '@/lib/digest/weekly'
import { loadCandidates } from '@/lib/apply/candidates'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'

/**
 * ONE displayed Fit (review 2026-10-10 P1-1, P1-8): the blend of Match and
 * AI, plus the optional growth nudge, held under the Match ceiling. The card
 * (shownFit), the list sort and filter (displayedFitSql), notifications, the
 * weekly digest and the shortlist all read it; "Needs a look" rows stay out
 * of New everywhere.
 */

interface Row {
  key: string
  fit: number | null
  ai: number | null
  ceiling?: number
  growth?: number
  needsLook?: boolean
}

const ROWS: Row[] = [
  { key: 'both', fit: 70, ai: 90 },
  { key: 'capped', fit: 20, ai: 98, ceiling: 30 },
  { key: 'capped-nudged', fit: 28, ai: 40, ceiling: 30, growth: 100 },
  { key: 'match-only', fit: 81, ai: null },
  { key: 'ai-only', fit: null, ai: 77 },
  { key: 'none', fit: null, ai: null },
  { key: 'nudged-down', fit: 60, ai: 60, growth: 0 },
  { key: 'look', fit: 70, ai: 90, needsLook: true },
]

async function seed(): Promise<{ userId: string; ids: Map<string, string> }> {
  const u = await makeUser()
  const src = await makeSource(u.id)
  const ids = new Map<string, string>()
  for (const r of ROWS) {
    const row = await makeDiscovery(u.id, src.id, {
      sourceJobId: r.key,
      normalized: { kind: 'job', title: `Role ${r.key}`, companyName: 'Example Co' },
      fitScore: r.fit,
      matchScore: r.ai,
      fitDetail: r.ceiling ? { v: 'm5', score: r.fit, confidence: 'full', components: [], requirements: [], missing: [], matched: [], ceiling: { score: r.ceiling, reason: 'Not eligible: x' } } : null,
      companyGrowth: r.growth ?? null,
      companyGrowthConfidence: r.growth === undefined ? null : 'high',
      relevanceNotes: r.needsLook ? { needsLook: true } : {},
    })
    ids.set(r.key, row.id)
  }
  return { userId: u.id, ids }
}

function expected(r: Row, growthInFit: boolean): number | null {
  const nudge = growthInFit && r.growth !== undefined ? growthFitNudge(r.growth, 'high') : 0
  return shownFit(r.fit, r.ai, r.ceiling ? { ceiling: { score: r.ceiling } } : null, nudge)
}

describe('displayedFitSql agrees with shownFit', () => {
  it.each([false, true])('growth in Fit: %s', async (growthInFit) => {
    const { userId } = await seed()
    const rows = await db
      .select({ key: discoveries.sourceJobId, v: sql<number | null>`${displayedFitSql({ growthInFit })}` })
      .from(discoveries)
      .where(eq(discoveries.userId, userId))
    for (const r of ROWS) {
      const got = rows.find((x) => x.key === r.key)!.v
      expect(got === null ? null : Number(got), r.key).toBe(expected(r, growthInFit))
    }
  })
})

describe('the list, notifications, digest and shortlist use it', () => {
  it('filters and sorts New by the displayed Fit, without Needs a look rows', async () => {
    const { userId } = await seed()
    const titles = (await discQ.list(userId, { status: 'new', needsLook: 'exclude', sort: 'match' })).map((r) => r.title)
    expect(titles).not.toContain('Role look')
    expect(titles.slice(0, 2)).toEqual(['Role match-only', 'Role both'])
    expect(titles.indexOf('Role capped')).toBeGreaterThan(titles.indexOf('Role nudged-down'))
    const atLeast31 = (await discQ.list(userId, { status: 'new', needsLook: 'exclude', minScore: 31 })).map((r) => r.title)
    expect(atLeast31).not.toContain('Role capped')
    const look = await discQ.list(userId, { status: 'new', needsLook: 'only' })
    expect(look.map((r) => r.title)).toEqual(['Role look'])
    expect(await discQ.countList(userId, { status: 'new', needsLook: 'only' })).toBe(1)
  })

  it('notifies on the displayed Fit: never a capped row, a Match-only row yes, never Needs a look', async () => {
    const { userId } = await seed()
    const items = await findNotifiableDiscoveries(userId, 75, new Date(Date.now() - 60_000).toISOString())
    const titles = items.map((i) => i.title)
    expect(titles).toEqual(['Role match-only', 'Role both', 'Role ai-only'])
    expect(items[0]!.matchScore).toBe(81)
  })

  it('the weekly digest lists the top New rows by the displayed Fit', async () => {
    const { userId } = await seed()
    const snap = await gatherPipelineSnapshot(userId)
    expect(snap.topDiscoveries.map((d) => d.title)).toEqual(['Role match-only', 'Role both', 'Role ai-only', 'Role nudged-down', 'Role capped-nudged'])
    expect(snap.topDiscoveries[0]!.matchScore).toBe(81)
  })

  it('the shortlist never considers Needs a look rows', async () => {
    const { userId } = await seed()
    const c = await loadCandidates(userId, { now: new Date(), feedback: [] })
    expect(c.map((x) => x.title)).not.toContain('Role look')
  })
})
