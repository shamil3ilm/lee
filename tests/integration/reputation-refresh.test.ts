import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import * as repQ from '@/lib/db/queries/companyReputation'
import { refreshCompanyReputation } from '@/lib/reputation/refresh'
import { refreshNow, scheduleReputationRefresh, WEEKLY_REFRESH_PER_DAY } from '@/lib/reputation/schedule'
import { defaultLimiter, NO_WAIT } from '@/lib/reputation/rate-limit'
import { REPUTATION_USER_AGENT } from '@/lib/reputation/http'
import { drain } from '@/lib/queue/drain'
import { appRegistry } from '@/lib/queue/handlers'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { allSourceRoutes, fixtureFetch, type Route } from '@/tests/fixtures/reputation/fetch'
import { makeCompany, makeUser } from '@/tests/factories'

const NOW = new Date('2026-09-27T09:00:00Z')

function stubNetwork(routes: Route[] = allSourceRoutes()) {
  const f = fixtureFetch(routes)
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  // The shared limiter would really sleep between GDELT calls.
  vi.spyOn(defaultLimiter, 'wait').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function acme() {
  const u = await makeUser()
  const c = await makeCompany(u.id, { name: 'Acme Payments', domain: 'acmepay.com', isWatched: true })
  return { u, c }
}

describe('refreshCompanyReputation', () => {
  it('stores signals, facts and per-source status from all three sources', async () => {
    const { u, c } = await acme()
    const fetchImpl = fixtureFetch(allSourceRoutes())
    const r = await refreshCompanyReputation(u.id, c.id, { fetchImpl, limiter: NO_WAIT, now: NOW })
    expect(r).toMatchObject({ status: 'refreshed', errors: [] })
    const rec = await repQ.get(u.id, c.id)
    expect(rec?.signals.map((s) => s.kind)).toEqual(['hn_hiring', 'hn_mention', 'hn_mention', 'news', 'news', 'news'])
    expect(rec?.facts?.wikidataId).toBe('Q900002')
    expect(rec?.sourceStatus.gdelt).toMatchObject({ ok: true, count: 3, error: null })
    expect(rec?.fetchedAt?.toISOString()).toBe(NOW.toISOString())
    // Honest client: every request carried the lee User-Agent.
    expect(fetchImpl.calls.length).toBe(6)
    expect(new Set(fetchImpl.agents)).toEqual(new Set([REPUTATION_USER_AGENT]))
  })

  it('records a failing source and keeps its earlier signals', async () => {
    const { u, c } = await acme()
    await refreshCompanyReputation(u.id, c.id, { fetchImpl: fixtureFetch(allSourceRoutes()), limiter: NO_WAIT, now: NOW })
    const gdeltDown: Route[] = [
      { match: (url) => url.host === 'api.gdeltproject.org', status: 429, body: 'Please limit requests' },
      ...allSourceRoutes(),
    ]
    const later = new Date(NOW.getTime() + 8 * 86_400_000)
    const r = await refreshCompanyReputation(u.id, c.id, { fetchImpl: fixtureFetch(gdeltDown), limiter: NO_WAIT, now: later })
    expect(r.errors).toEqual(['gdelt: gdelt: rate limited (429)'])
    const rec = await repQ.get(u.id, c.id)
    expect(rec?.sourceStatus.gdelt).toMatchObject({ ok: false, error: 'gdelt: rate limited (429)' })
    expect(rec?.sourceStatus.hn?.ok).toBe(true)
    expect(rec?.signals.filter((s) => s.source === 'gdelt')).toHaveLength(3)
  })

  it('is a no-op for another user’s company', async () => {
    const { c } = await acme()
    const other = await makeUser()
    const fetchImpl = fixtureFetch(allSourceRoutes())
    await expect(refreshCompanyReputation(other.id, c.id, { fetchImpl, limiter: NO_WAIT })).resolves.toMatchObject({
      status: 'not_found',
    })
    expect(fetchImpl.calls).toHaveLength(0)
  })
})

describe('reputation refresh job', () => {
  // Real clock: the drain claims jobs due by the wall-clock time.
  const NOW = new Date()

  it('weekly plan: stale watched companies only, once per ISO week, bounded', async () => {
    const { u, c } = await acme()
    await makeCompany(u.id, { name: 'Unwatched', isWatched: false })
    const fresh = await makeCompany(u.id, { name: 'Fresh Co', isWatched: true })
    await repQ.saveFetched(u.id, fresh.id, { signals: [], sourceStatus: {}, facts: null, fetchedAt: NOW })
    expect(await scheduleReputationRefresh(NOW)).toEqual({ planned: 1, enqueued: 1 })
    expect(await scheduleReputationRefresh(new Date(NOW.getTime() + 3_600_000))).toEqual({ planned: 1, enqueued: 0 })
    const [job] = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.companyReputation))
    expect(job?.payload).toEqual({ companyId: c.id, trigger: 'weekly' })
    expect(WEEKLY_REFRESH_PER_DAY).toBeLessThanOrEqual(20)
  })

  it('the drained job fetches with the stubbed network and stores the result', async () => {
    const { u, c } = await acme()
    const net = stubNetwork()
    await scheduleReputationRefresh(NOW)
    const r = await drain({ budgetMs: 30_000, types: [JOB_TYPES.companyReputation], registry: appRegistry })
    expect(r.errors.filter((e) => !e.includes(`company `)), JSON.stringify(r)).toEqual([])
    expect(r.done).toBe(1)
    expect(r.metrics).toMatchObject({ reputation_refreshed: 1, reputation_source_errors: 0 })
    expect((await repQ.get(u.id, c.id))?.signals.length).toBeGreaterThan(0)
    expect(net.calls).toHaveLength(6)
    expect(new Set(net.agents)).toEqual(new Set([REPUTATION_USER_AGENT]))
  })

  it('source errors are warnings, not job failures', async () => {
    const { u, c } = await acme()
    stubNetwork([{ match: () => true, status: 503, body: 'down' }])
    await scheduleReputationRefresh(NOW)
    const r = await drain({ budgetMs: 30_000, types: [JOB_TYPES.companyReputation], registry: appRegistry })
    expect(r.errors.filter((e) => !e.includes(`company `)), JSON.stringify(r)).toEqual([])
    expect(r.done).toBe(1)
    expect(r.errors.filter((e) => e.includes(`company ${c.id}`))).toHaveLength(3)
    expect((await repQ.get(u.id, c.id))?.sourceStatus.wikidata?.ok).toBe(false)
  })

  it('on demand: runs now, then refuses a second refresh within the hour', async () => {
    const { u, c } = await acme()
    stubNetwork()
    expect(await refreshNow(u.id, c.id, NOW)).toEqual({ status: 'done', failed: false })
    expect(await refreshNow(u.id, c.id, new Date(NOW.getTime() + 60_000))).toEqual({ status: 'recent' })
    expect((await repQ.get(u.id, c.id))?.facts?.label).toBe('Acme Payments')
  })

  it('on demand: "once an hour" is a rolling hour, not the clock hour', async () => {
    const { u, c } = await acme()
    stubNetwork()
    expect(await refreshNow(u.id, c.id, NOW)).toEqual({ status: 'done', failed: false })
    // 59 minutes later is always a different clock hour, yet within the hour.
    expect(await refreshNow(u.id, c.id, new Date(NOW.getTime() + 59 * 60_000))).toEqual({ status: 'recent' })
    // 61 minutes later is allowed again.
    expect(await refreshNow(u.id, c.id, new Date(NOW.getTime() + 61 * 60_000))).not.toEqual({ status: 'recent' })
  })
})
