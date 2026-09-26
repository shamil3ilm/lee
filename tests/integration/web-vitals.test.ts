import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db/client'
import { webVitalsDaily } from '@/lib/db/schema'
import * as vitalsQ from '@/lib/db/queries/webVitals'
import { pruneWebVitals, WEB_VITALS_RETENTION_DAYS } from '@/lib/db/retention'
import { bucketIndex, HISTOGRAM_BUCKETS } from '@/lib/vitals/metrics'
import type { VitalsBeacon } from '@/lib/vitals/beacon'
import { makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

const beacon = (over: Partial<VitalsBeacon> = {}): VitalsBeacon => ({
  route: '/applications',
  navigationType: 'navigate',
  device: 'desktop',
  connection: '4g',
  metrics: [
    { name: 'TTFB', value: 150 },
    { name: 'LCP', value: 2200 },
  ],
  ...over,
})

beforeEach(() => {
  authMock.mockReset()
})

describe('recordBeacon', () => {
  it('upserts one row per metric and sums count, sum, histogram and dims', async () => {
    const u = await makeUser()
    await vitalsQ.recordBeacon(u.id, '2026-09-26', beacon())
    await vitalsQ.recordBeacon(
      u.id,
      '2026-09-26',
      beacon({ device: 'mobile', metrics: [{ name: 'LCP', value: 2300 }, { name: 'LCP', value: 9000 }] }),
    )
    const rows = await vitalsQ.listSince(u.id, '2026-09-01')
    expect(rows).toHaveLength(2)
    const lcp = rows.find((r) => r.metric === 'LCP')!
    expect(lcp.count).toBe(3)
    expect(lcp.sum).toBe(2200 + 2300 + 9000)
    expect(lcp.histogram).toHaveLength(HISTOGRAM_BUCKETS)
    expect(lcp.histogram[bucketIndex('LCP', 2200)]).toBe(2)
    expect(lcp.histogram[bucketIndex('LCP', 9000)]).toBe(1)
    expect(lcp.dims).toEqual({
      'device:desktop': 1,
      'device:mobile': 2,
      'conn:4g': 3,
      'nav:navigate': 3,
    })
    const ttfb = rows.find((r) => r.metric === 'TTFB')!
    expect(ttfb.count).toBe(1)
  })

  it('keeps users, days and routes apart', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await vitalsQ.recordBeacon(a.id, '2026-09-25', beacon())
    await vitalsQ.recordBeacon(a.id, '2026-09-26', beacon({ route: '/' }))
    await vitalsQ.recordBeacon(b.id, '2026-09-26', beacon())
    expect(await vitalsQ.listSince(a.id, '2026-09-26')).toHaveLength(2)
    expect(await vitalsQ.listSince(a.id, '2026-09-01')).toHaveLength(4)
    expect(await vitalsQ.listSince(b.id, '2026-09-01')).toHaveLength(2)
  })
})

describe('pruneWebVitals', () => {
  it(`deletes days older than ${WEB_VITALS_RETENTION_DAYS} days`, async () => {
    const u = await makeUser()
    const now = new Date('2026-09-26T03:00:00Z')
    await vitalsQ.recordBeacon(u.id, '2026-06-27', beacon()) // 91 days old
    await vitalsQ.recordBeacon(u.id, '2026-06-28', beacon()) // exactly 90
    expect(await pruneWebVitals(now, { batchSize: 1 })).toBe(2)
    const left = await db.select().from(webVitalsDaily)
    expect(left.map((r) => r.day)).toEqual(['2026-06-28', '2026-06-28'])
  })
})

describe('POST /api/vitals', () => {
  async function post(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/vitals/route')
    return POST(
      new Request('http://localhost/api/vitals', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    )
  }

  it('requires a session', async () => {
    authMock.mockResolvedValue(null)
    expect((await post(beacon())).status).toBe(401)
  })

  it('stores a valid beacon and answers 204', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const res = await post(beacon({ route: '/applications/[id]' }))
    expect(res.status).toBe(204)
    const rows = await vitalsQ.listSince(u.id, '2000-01-01')
    expect(rows.map((r) => r.route)).toEqual(['/applications/[id]', '/applications/[id]'])
  })

  it('rejects malformed, invalid, oversized and cross-site beacons', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    expect((await post('{nope')).status).toBe(400)
    expect((await post({ ...beacon(), route: '/a?b=c' })).status).toBe(400)
    expect((await post({ ...beacon(), metrics: [{ name: 'LCP', value: 'fast' }] })).status).toBe(400)
    expect((await post('x'.repeat(5000))).status).toBe(413)
    expect((await post(beacon(), { origin: 'https://evil.test' })).status).toBe(403)
    expect(await vitalsQ.listSince(u.id, '2000-01-01')).toHaveLength(0)
  })

  it('rate-limits each user per minute', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const statuses: number[] = []
    for (let i = 0; i < 32; i++) statuses.push((await post(beacon())).status)
    expect(statuses.filter((s) => s === 204)).toHaveLength(30)
    expect(statuses.slice(30)).toEqual([429, 429])
  })
})
