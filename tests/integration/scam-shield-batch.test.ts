import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db, pgliteClient } from '@/lib/db/client'
import { discoveries as discTable, jobRiskAssessments } from '@/lib/db/schema'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import * as discQ from '@/lib/db/queries/discoveries'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { RULES_VERSION } from '@/lib/scam/version'

/** Every SQL statement PGlite runs while `fn` executes. */
async function captureSql(fn: () => Promise<unknown>): Promise<string[]> {
  const spy = vi.spyOn(pgliteClient!, 'query')
  try {
    await fn()
    return spy.mock.calls.map((c) => String(c[0]))
  } finally {
    spy.mockRestore()
  }
}

function normalized(i: number, over: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    kind: 'job',
    title: `Typist ${i}`,
    companyName: 'Brightpath Global',
    companyDomain: 'brightpath-global.com',
    applyUrl: `https://brightpath-global.com/apply/${i}`,
    descriptionMd: 'Simple copy-paste work. Pay the joining fee of Rs. 500. Contact on Telegram @bp_hr.',
    techStack: [],
    raw: {},
    ...over,
  }
}

async function seedDiscoveries(n: number): Promise<{ userId: string; ids: string[] }> {
  const u = await makeUser()
  const src = await sourcesQ.create(u.id, { name: 'GH', kind: 'greenhouse', config: { company: 'x' } })
  const rows = await db
    .insert(discTable)
    .values(
      Array.from({ length: n }, (_, i) => ({
        userId: u.id,
        sourceId: src.id,
        sourceJobId: `s-${i}`,
        raw: {},
        normalized: normalized(i) as never,
      })),
    )
    .returning()
  return { userId: u.id, ids: rows.map((r) => r.id) }
}

describe('Scam Shield batching', () => {
  afterEach(() => {
    vi.doUnmock('next/server')
    vi.resetModules()
  })
  beforeEach(() => {
    vi.resetModules()
  })

  it('reassessStaleDiscoveries uses a constant number of queries, loading the allow-list once', async () => {
    const { userId, ids } = await seedDiscoveries(12)
    const { reassessStaleDiscoveries } = await import('@/lib/scam/service')
    let n = 0
    const sqls = await captureSql(async () => {
      n = await reassessStaleDiscoveries(userId)
    })
    expect(n).toBe(ids.length)
    // Before: per item one input SELECT, one allow-list SELECT and one
    // upsert (3 × 12 = 36+). Now: ids, inputs, allow-list, one upsert.
    expect(sqls.length).toBeLessThanOrEqual(6)
    expect(sqls.filter((s) => /from "scam_allow_list"/i.test(s))).toHaveLength(1)
    const rows = await db.select().from(jobRiskAssessments).where(eq(jobRiskAssessments.userId, userId))
    expect(rows).toHaveLength(12)
    expect(rows.every((r) => r.rulesVersion === RULES_VERSION && r.level === 'likely_scam')).toBe(true)
  })

  it('assessNewDiscoveries writes every assessment in one upsert and honours a preloaded allow-list', async () => {
    const { userId, ids } = await seedDiscoveries(5)
    await allowQ.add(userId, 'domain', 'brightpath-global.com')
    const allowList = await allowQ.list(userId)
    const { assessNewDiscoveries } = await import('@/lib/scam/service')
    const entries = ids.map((id, i) => ({ id, normalized: normalized(i), sourceName: 'GH' }))
    const sqls = await captureSql(() => assessNewDiscoveries(userId, entries, { allowList }))
    expect(sqls.filter((s) => /from "scam_allow_list"/i.test(s))).toHaveLength(0)
    expect(sqls.filter((s) => /insert into "job_risk_assessments"/i.test(s))).toHaveLength(1)
    const rows = await db.select().from(jobRiskAssessments).where(eq(jobRiskAssessments.userId, userId))
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.allowListed)).toBe(true)
  })

  it('"not a scam" frees quarantined siblings with batched input loads', async () => {
    const { userId, ids } = await seedDiscoveries(10)
    const { reassessStaleDiscoveries, setUserVerdict } = await import('@/lib/scam/service')
    await reassessStaleDiscoveries(userId)
    const sqls = await captureSql(() => setUserVerdict(userId, 'discovery', ids[0]!, 'not_scam'))
    // Before: one input SELECT per quarantined sibling (10) + one insert per
    // allow-list entry. Now bounded regardless of how many siblings exist.
    expect(sqls.length).toBeLessThanOrEqual(12)
    expect(await discQ.countQuarantined(userId)).toBe(0)
  })

  it('ensureJobAssessment renders the stored row and re-assesses after the response inside a request', async () => {
    const scheduled: Array<Promise<unknown>> = []
    vi.doMock('next/server', async (orig) => ({
      ...(await orig<typeof import('next/server')>()),
      after: (task: Promise<unknown>) => {
        scheduled.push(task)
      },
    }))
    const u = await makeUser()
    const { makeCompany, makeJob } = await import('@/tests/factories')
    const co = await makeCompany(u.id)
    const job = await makeJob(u.id, co.id)
    const { ensureJobAssessment } = await import('@/lib/scam/service')

    // No stored row yet: nothing to render, assessment scheduled, not awaited.
    expect(await ensureJobAssessment(u.id, job.id)).toBeNull()
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)
    const stored = await riskQ.get(u.id, 'job', job.id)
    expect(stored?.rulesVersion).toBe(RULES_VERSION)

    // Stale row (older rules version): rendered as-is, refreshed afterwards.
    await db
      .update(jobRiskAssessments)
      .set({ rulesVersion: 'scam-0.0.1' })
      .where(eq(jobRiskAssessments.id, stored!.id))
    const rendered = await ensureJobAssessment(u.id, job.id)
    expect(rendered?.rulesVersion).toBe('scam-0.0.1')
    expect(scheduled).toHaveLength(2)
    await Promise.all(scheduled)
    expect((await riskQ.get(u.id, 'job', job.id))?.rulesVersion).toBe(RULES_VERSION)

    // Fresh row: no write scheduled at all.
    await ensureJobAssessment(u.id, job.id)
    expect(scheduled).toHaveLength(2)
    // Discovery table untouched by job assessments.
    expect(await db.select().from(discTable)).toHaveLength(0)
  })
})
