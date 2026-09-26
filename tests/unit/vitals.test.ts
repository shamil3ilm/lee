import { describe, expect, it } from 'vitest'
import {
  bucketIndex,
  HISTOGRAM_BUCKETS,
  histogramPercentile,
  mergeHistograms,
  rateVital,
  ratingShares,
  singleSampleHistogram,
} from '@/lib/vitals/metrics'
import { ROUTE_PATTERN_RE, toRoutePattern } from '@/lib/vitals/route-pattern'
import { beaconSchema } from '@/lib/vitals/beacon'
import { createRateLimiter } from '@/lib/vitals/rate-limit'
import {
  connectionType,
  createVitalsQueue,
  deviceClass,
  MAX_BEACONS_PER_MINUTE,
  navigationType,
} from '@/lib/vitals/client'
import { buildVitalsReport, daysBetween } from '@/lib/vitals/report'

function histogramOf(metric: 'LCP' | 'CLS', values: number[]): number[] {
  return values.reduce<number[]>(
    (h, v) => mergeHistograms(h, singleSampleHistogram(metric, v)),
    new Array<number>(HISTOGRAM_BUCKETS).fill(0),
  )
}

describe('vitals metrics', () => {
  it('rates against Google thresholds (inclusive good / poor bounds)', () => {
    expect(rateVital('LCP', 2500)).toBe('good')
    expect(rateVital('LCP', 2501)).toBe('needs-improvement')
    expect(rateVital('LCP', 4000)).toBe('needs-improvement')
    expect(rateVital('LCP', 4001)).toBe('poor')
    expect(rateVital('CLS', 0.1)).toBe('good')
    expect(rateVital('CLS', 0.3)).toBe('poor')
    expect(rateVital('INP', 250)).toBe('needs-improvement')
  })

  it('buckets values with inclusive upper bounds and an overflow bucket', () => {
    expect(bucketIndex('LCP', 0)).toBe(0)
    expect(bucketIndex('LCP', 50)).toBe(0)
    expect(bucketIndex('LCP', 51)).toBe(1)
    expect(bucketIndex('LCP', 99_999)).toBe(HISTOGRAM_BUCKETS - 1)
    expect(bucketIndex('CLS', 0.1)).toBe(4)
    expect(singleSampleHistogram('LCP', 2400)).toHaveLength(HISTOGRAM_BUCKETS)
  })

  it('estimates p75 by interpolating inside the bucket', () => {
    expect(histogramPercentile('LCP', new Array(HISTOGRAM_BUCKETS).fill(0), 0.75)).toBeNull()
    // Four samples in (2000, 2500]: p75 lands 3/4 of the way through.
    const h = histogramOf('LCP', [2100, 2200, 2300, 2400])
    expect(histogramPercentile('LCP', h, 0.75)).toBe(2375)
    // Overflow reports the last bound as a floor.
    expect(histogramPercentile('LCP', histogramOf('LCP', [60_000]), 0.75)).toBe(15000)
  })

  it('splits samples into rating shares exactly at the thresholds', () => {
    const h = histogramOf('LCP', [1000, 2500, 3000, 9000])
    expect(ratingShares('LCP', h)).toEqual({ good: 0.5, 'needs-improvement': 0.25, poor: 0.25 })
  })
})

describe('toRoutePattern', () => {
  it('collapses ids and keeps static segments', () => {
    expect(toRoutePattern('/')).toBe('/')
    expect(toRoutePattern('/applications')).toBe('/applications')
    expect(toRoutePattern('/applications/5f0c3c9e-2b7a-4a51-9f3e-1d2c3b4a5e6f')).toBe('/applications/[id]')
    expect(toRoutePattern('/documents/123/edit?x=1#y')).toBe('/documents/[id]/edit')
    expect(toRoutePattern('/Settings/AI/')).toBe('/settings/ai')
    expect(toRoutePattern('/search/hello%20world')).toBe('/search/[id]')
  })

  it('always produces a pattern the API accepts, capped in length', () => {
    const long = `/${Array.from({ length: 10 }, () => 'abcdefghijklmnopqrs').join('/')}`
    for (const p of ['/', '/a/b', long, '/x.y/../z', '//double//slash']) {
      const route = toRoutePattern(p)
      expect(route).toMatch(ROUTE_PATTERN_RE)
      expect(route.length).toBeLessThanOrEqual(80)
    }
  })
})

describe('beaconSchema', () => {
  const ok = {
    route: '/applications/[id]',
    navigationType: 'navigate',
    device: 'desktop',
    connection: '4g',
    metrics: [
      { name: 'LCP', value: 1800 },
      { name: 'CLS', value: 0.02 },
    ],
  }

  it('accepts a well-formed beacon', () => {
    expect(beaconSchema.safeParse(ok).success).toBe(true)
  })

  it('rejects raw URLs, unknown metrics and out-of-range values', () => {
    expect(beaconSchema.safeParse({ ...ok, route: '/applications?id=1' }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...ok, route: 'https://x.test/' }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...ok, metrics: [{ name: 'FID', value: 1 }] }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...ok, metrics: [{ name: 'LCP', value: -1 }] }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...ok, metrics: [{ name: 'CLS', value: 500 }] }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...ok, metrics: [] }).success).toBe(false)
    expect(beaconSchema.safeParse({ ...ok, device: 'watch' }).success).toBe(false)
  })
})

describe('createRateLimiter', () => {
  it('allows `limit` calls per window per key, then resets', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 })
    expect(rl.take('a', 0)).toBe(true)
    expect(rl.take('a', 10)).toBe(true)
    expect(rl.take('a', 20)).toBe(false)
    expect(rl.take('b', 20)).toBe(true)
    expect(rl.take('a', 1000)).toBe(true)
  })

  it('evicts the oldest key beyond maxKeys', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 })
    rl.take('a', 0)
    rl.take('b', 0)
    rl.take('c', 0)
    // 'a' was evicted, so it starts a fresh window.
    expect(rl.take('a', 1)).toBe(true)
  })
})

describe('client helpers', () => {
  it('classifies device, connection and navigation type', () => {
    expect(deviceClass(390, true)).toBe('mobile')
    expect(deviceClass(900, true)).toBe('tablet')
    expect(deviceClass(900, false)).toBe('desktop')
    expect(connectionType('4g')).toBe('4g')
    expect(connectionType(undefined)).toBe('unknown')
    expect(connectionType('5g')).toBe('unknown')
    expect(navigationType('back_forward')).toBe('back-forward')
    expect(navigationType('reload')).toBe('reload')
    expect(navigationType('weird')).toBe('navigate')
  })
})

describe('createVitalsQueue', () => {
  function setup() {
    const sent: string[] = []
    let now = 0
    let timerFn: (() => void) | null = null
    const queue = createVitalsQueue({
      context: () => ({ pathname: '/applications/42', width: 1440, coarsePointer: false, effectiveType: '4g' }),
      send: (b) => sent.push(b),
      now: () => now,
      setTimer: (fn) => {
        timerFn = fn
        return 1
      },
      clearTimer: () => {
        timerFn = null
      },
    })
    return {
      queue,
      sent,
      tick: (ms: number) => {
        now += ms
      },
      fireTimer: () => timerFn?.(),
    }
  }

  it('batches metrics into one beacon with the load context', () => {
    const { queue, sent, fireTimer } = setup()
    queue.add({ id: '1', name: 'TTFB', value: 120, navigationType: 'navigate' })
    queue.add({ id: '2', name: 'FCP', value: 400 })
    queue.add({ id: '3', name: 'FID', value: 4 }) // not tracked
    fireTimer()
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]!)).toEqual({
      route: '/applications/[id]',
      navigationType: 'navigate',
      device: 'desktop',
      connection: '4g',
      metrics: [
        { name: 'TTFB', value: 120 },
        { name: 'FCP', value: 400 },
      ],
    })
  })

  it('ignores a re-reported metric id and sends nothing when empty', () => {
    const { queue, sent } = setup()
    queue.add({ id: 'cls', name: 'CLS', value: 0.01 })
    queue.flush()
    queue.add({ id: 'cls', name: 'CLS', value: 0.2 })
    queue.flush()
    expect(sent).toHaveLength(1)
  })

  it(`caps at ${MAX_BEACONS_PER_MINUTE} beacons per minute`, () => {
    const { queue, sent, tick } = setup()
    for (let i = 0; i < MAX_BEACONS_PER_MINUTE + 3; i++) {
      queue.add({ id: `m${i}`, name: 'INP', value: 50 })
      queue.flush()
    }
    expect(sent).toHaveLength(MAX_BEACONS_PER_MINUTE)
    tick(60_000)
    queue.add({ id: 'later', name: 'INP', value: 50 })
    queue.flush()
    expect(sent).toHaveLength(MAX_BEACONS_PER_MINUTE + 1)
  })
})

describe('browser bundle guard', () => {
  it('keeps zod (and the zod schema module) out of the reporter import graph', async () => {
    const { readFile } = await import('node:fs/promises')
    const files = [
      'components/web-vitals-reporter.tsx',
      'lib/vitals/client.ts',
      'lib/vitals/beacon-fields.ts',
      'lib/vitals/metrics.ts',
      'lib/vitals/route-pattern.ts',
    ]
    for (const f of files) {
      const src = await readFile(f, 'utf8')
      expect(src, f).not.toMatch(/from ['"]zod['"]|from ['"](\.\/|@\/lib\/vitals\/)beacon['"]/)
    }
  })
})

describe('buildVitalsReport', () => {
  const window = { fromDay: '2026-09-24', toDay: '2026-09-26' }
  const row = (day: string, route: string, metric: string, values: number[], dims = {}) => ({
    day,
    route,
    metric,
    count: values.length,
    histogram: histogramOf(metric === 'CLS' ? 'CLS' : 'LCP', values),
    dims,
  })

  it('lists every day in the window', () => {
    expect(daysBetween('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })

  it('computes per-route and overall p75, trend and dimension shares', () => {
    const report = buildVitalsReport(
      [
        row('2026-09-24', '/', 'TTFB', [100, 200], { 'device:desktop': 2 }),
        row('2026-09-24', '/', 'LCP', [2100, 2200, 2300, 2400]),
        row('2026-09-26', '/applications', 'TTFB', [900], { 'device:mobile': 1 }),
        row('2026-09-26', '/applications', 'LCP', [5000]),
        row('2026-09-26', '/applications', 'BOGUS', [1]),
      ],
      window,
    )
    expect(report.totalLoads).toBe(3)
    expect(report.routes.map((r) => r.route)).toEqual(['/', '/applications'])
    expect(report.routes[0]!.metrics.LCP).toEqual({ p75: 2375, rating: 'good', count: 4 })
    expect(report.routes[1]!.metrics.LCP.rating).toBe('poor')
    expect(report.routes[1]!.metrics.INP).toEqual({ p75: null, rating: null, count: 0 })
    const lcp = report.overall.find((o) => o.metric === 'LCP')!
    expect(lcp.count).toBe(5)
    expect(lcp.shares.poor).toBeCloseTo(0.2)
    expect(report.trend.LCP.map((p) => p.count)).toEqual([4, 0, 1])
    expect(report.trend.LCP[1]!.p75).toBeNull()
    expect(report.dims['device:desktop']).toBeCloseTo(2 / 3)
  })
})
