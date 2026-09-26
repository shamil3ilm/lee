import { describe, expect, it } from 'vitest'
import * as limits from '@/lib/usage/limits'
import {
  crossedThreshold,
  GLOBAL_METER_IDS,
  meterFraction,
  meterLevel,
  METER_DEFS,
  projectEndOfMonth,
  utcPeriod,
  type MeterReading,
} from '@/lib/usage/meters'
import { evaluateThrottles, resolveThrottles } from '@/lib/usage/throttle'
import { warningsFor } from '@/lib/usage/alerts'
import { buildGlobalReadings, buildUserReadings, emptyGlobalReadings } from '@/lib/usage/collect'
import { EMPTY_SNAPSHOT_DATA, parseSnapshotData, type UsageSnapshotData } from '@/lib/usage/snapshot-data'
import { buildMeterViews, withLive } from '@/lib/usage/view-model'
import { formatBytes, formatMeterValue, formatPercent } from '@/lib/usage/format'
import type { NeonUsage } from '@/lib/usage/neon-api'

const GB = 1024 ** 3
const NOW = new Date('2026-09-26T12:00:00Z')

describe('limits', () => {
  it('every limit names its docs page and last-verified date', () => {
    const all = Object.values(limits).filter(
      (v): v is limits.FreeTierLimit => typeof v === 'object' && v !== null && 'docsUrl' in v,
    )
    expect(all.length).toBeGreaterThanOrEqual(10)
    for (const l of all) {
      expect(l.docsUrl).toMatch(/^https:\/\//)
      expect(l.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(l.value).toBeGreaterThan(0)
    }
  })

  it('matches the vendor pages verified on 2026-09-26', () => {
    expect(limits.NEON_STORAGE_LIMIT.value).toBe(0.5 * GB)
    expect(limits.NEON_COMPUTE_LIMIT.value).toBe(100)
    expect(limits.NEON_EGRESS_LIMIT.value).toBe(5 * GB)
    expect(limits.VERCEL_INVOCATIONS_LIMIT.value).toBe(1_000_000)
    expect(limits.VERCEL_ACTIVE_CPU_LIMIT.value).toBe(4)
    expect(limits.VERCEL_MEMORY_LIMIT.value).toBe(360)
    expect(limits.VERCEL_FAST_TRANSFER_LIMIT.value).toBe(100 * GB)
    expect(limits.VERCEL_ORIGIN_TRANSFER_LIMIT.value).toBe(10 * GB)
    expect(limits.NEON_COMPUTE_LIMIT.docsUrl).toBe('https://neon.com/docs/introduction/plans')
    expect(limits.VERCEL_ACTIVE_CPU_LIMIT.docsUrl).toBe('https://vercel.com/docs/plans/hobby')
  })
})

describe('levels and thresholds', () => {
  it('amber at 70 %, red at 90 %', () => {
    expect(meterLevel(null)).toBe('unknown')
    expect(meterLevel(0.69)).toBe('ok')
    expect(meterLevel(0.7)).toBe('warn')
    expect(meterLevel(0.9)).toBe('critical')
    expect(meterLevel(1.4)).toBe('critical')
    expect(crossedThreshold(0.5)).toBeNull()
    expect(crossedThreshold(0.75)).toBe(70)
    expect(crossedThreshold(0.95)).toBe(90)
    expect(crossedThreshold(null)).toBeNull()
  })

  it('fraction needs a value and a positive limit', () => {
    expect(meterFraction(null, 10)).toBeNull()
    expect(meterFraction(5, null)).toBeNull()
    expect(meterFraction(5, 0)).toBeNull()
    expect(meterFraction(5, 10)).toBe(0.5)
  })

  it('period is the UTC month', () => {
    expect(utcPeriod(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09')
    expect(utcPeriod(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10')
  })
})

describe('projectEndOfMonth', () => {
  it('monthly meter with one point: value over elapsed days, times the month', () => {
    // Sep 26 12:00 → 25.5 days elapsed, 4.5 left; 51 CU-h so far = 2/day.
    const p = projectEndOfMonth([{ day: '2026-09-26', used: 51 }], 'monthly', NOW)
    expect(p).toBeCloseTo(51 + 2 * 4.5, 5)
  })

  it('monthly meter with a trend uses the slope and ignores last month', () => {
    const p = projectEndOfMonth(
      [
        { day: '2026-08-31', used: 99 },
        { day: '2026-09-20', used: 40 },
        { day: '2026-09-26', used: 52 },
      ],
      'monthly',
      NOW,
    )
    expect(p).toBeCloseTo(52 + 2 * 4.5, 5)
  })

  it('level meter projects the last two weeks of change, never below zero', () => {
    const up = projectEndOfMonth(
      [
        { day: '2026-09-16', used: 100 },
        { day: '2026-09-26', used: 200 },
      ],
      'level',
      NOW,
    )
    expect(up).toBeCloseTo(200 + 10 * 4.5, 5)
    const down = projectEndOfMonth(
      [
        { day: '2026-09-25', used: 1000 },
        { day: '2026-09-26', used: 10 },
      ],
      'level',
      NOW,
    )
    expect(down).toBe(0)
    expect(projectEndOfMonth([{ day: '2026-09-26', used: 7 }], 'level', NOW)).toBe(7)
    expect(projectEndOfMonth([], 'monthly', NOW)).toBeNull()
  })
})

function neon(over: Partial<NeonUsage> = {}): NeonUsage {
  return {
    projectId: 'p-1',
    computeCuHours: 10,
    egressBytes: GB,
    storageBytes: null,
    periodStart: null,
    periodEnd: null,
    computeState: 'idle',
    ...over,
  }
}

const M = {
  dbSizeBytes: 0.1 * GB,
  largestTables: [],
  queue: { backlog: 3, dead: 1, doneRecent: 40 },
  assetBytes: new Map([['u1', 10]]),
}

describe('readings', () => {
  it('without a Neon key: storage measured, compute/egress unavailable, Vercel on the dashboard', () => {
    const r = buildGlobalReadings(M, null)
    expect(r.map((x) => x.id)).toEqual([...GLOBAL_METER_IDS])
    const by = Object.fromEntries(r.map((x) => [x.id, x]))
    expect(by.neon_storage).toEqual({ id: 'neon_storage', used: 0.1 * GB, source: 'measured' })
    expect(by.neon_compute).toEqual({ id: 'neon_compute', used: null, source: 'unavailable' })
    expect(by.vercel_active_cpu?.source).toBe('vendor_dashboard')
    expect(by.queue_dead?.used).toBe(1)
    expect(by.playground_assets?.source).toBe('placeholder')
  })

  it('with Neon usage: compute and egress from the API', () => {
    const r = buildGlobalReadings(M, neon({ computeCuHours: 12.5 }))
    expect(r.find((x) => x.id === 'neon_compute')).toEqual({ id: 'neon_compute', used: 12.5, source: 'neon_api' })
    expect(r.find((x) => x.id === 'neon_egress')?.source).toBe('neon_api')
    const missing = buildGlobalReadings(M, neon({ egressBytes: null }))
    expect(missing.find((x) => x.id === 'neon_egress')?.source).toBe('unavailable')
  })

  it('per-user readings and the empty set', () => {
    expect(buildUserReadings(M)).toEqual({ u1: [{ id: 'asset_storage', used: 10, source: 'measured' }] })
    expect(emptyGlobalReadings().find((x) => x.id === 'neon_storage')?.used).toBeNull()
  })

  it('live values replace stored ones and missing ones are appended', () => {
    const merged = withLive(
      [{ id: 'neon_storage', used: 1, source: 'measured' }],
      [
        { id: 'neon_storage', used: 2, source: 'measured' },
        { id: 'asset_storage', used: 3, source: 'measured' },
      ],
    )
    expect(merged.map((m) => m.used)).toEqual([2, 3])
  })
})

describe('throttles', () => {
  const at = (id: MeterReading['id'], fraction: number): MeterReading => ({
    id,
    used: fraction * (METER_DEFS[id].limit?.value ?? 1),
    source: 'neon_api',
  })

  it('pause at ≥90 % compute or egress; early retention at ≥90 % storage', () => {
    expect(evaluateThrottles([at('neon_compute', 0.89)])).toEqual([])
    expect(evaluateThrottles([at('neon_compute', 0.9)])).toEqual(['pause_nonessential'])
    expect(evaluateThrottles([at('neon_egress', 0.95)])).toEqual(['pause_nonessential'])
    expect(evaluateThrottles([at('neon_storage', 0.91)])).toEqual(['early_retention'])
    expect(evaluateThrottles([{ id: 'neon_compute', used: null, source: 'unavailable' }])).toEqual([])
  })

  it('apply only in the snapshot month, and the owner can resume the pause', () => {
    const base = { throttles: ['pause_nonessential', 'early_retention', 'bogus'], now: NOW }
    const on = resolveThrottles({ ...base, snapshotDay: '2026-09-25', resumed: false })
    expect([...on.active].sort()).toEqual(['early_retention', 'pause_nonessential'])
    const resumed = resolveThrottles({ ...base, snapshotDay: '2026-09-25', resumed: true })
    expect([...resumed.active]).toEqual(['early_retention'])
    expect(resumed.requested.has('pause_nonessential')).toBe(true)
    const stale = resolveThrottles({ ...base, snapshotDay: '2026-08-31', resumed: false })
    expect(stale.active.size).toBe(0)
    expect(resolveThrottles({ ...base, snapshotDay: null, resumed: false }).active.size).toBe(0)
  })
})

describe('warnings', () => {
  it('global warn meters plus the user’s own, highest first; info meters never warn', () => {
    const data: UsageSnapshotData = {
      ...EMPTY_SNAPSHOT_DATA,
      readings: [
        { id: 'neon_storage', used: 0.75 * 0.5 * GB, source: 'measured' },
        { id: 'neon_compute', used: 95, source: 'neon_api' },
        { id: 'queue_dead', used: 1_000, source: 'measured' },
      ],
      userReadings: { me: [{ id: 'asset_storage', used: 149 * 1024 * 1024, source: 'measured' }] },
    }
    const w = warningsFor(data, 'me')
    expect(w.map((x) => [x.meter, x.threshold])).toEqual([
      ['asset_storage', 90],
      ['neon_compute', 90],
      ['neon_storage', 70],
    ])
    expect(w[1]?.detail).toBe('95 CU-h of 100 CU-h')
    expect(warningsFor(data, 'someone-else').map((x) => x.meter)).not.toContain('asset_storage')
  })
})

describe('view model', () => {
  it('labels sources in plain words and links to where to act', () => {
    const readings = buildGlobalReadings(M, null)
    const views = buildMeterViews({ readings, history: [], userId: 'u1', now: NOW })
    const by = Object.fromEntries(views.map((v) => [v.id, v]))
    expect(by.neon_storage?.sourceLabel).toBe('Measured')
    expect(by.neon_compute?.sourceLabel).toBe('Not measured: add a Neon API key')
    expect(by.neon_compute?.link?.href).toBe('/settings/ai#service-keys')
    expect(by.vercel_invocations?.sourceLabel).toBe('Not available on Hobby: see Vercel dashboard')
    expect(by.vercel_invocations?.link?.href).toMatch(/^https:\/\/vercel\.com\//)
    expect(by.queue_dead?.link?.href).toBe('/settings/jobs')
    expect(by.jobs_run?.limit).toBeNull()
    expect(by.neon_storage?.level).toBe('ok')
  })

  it('projects from the stored trend plus today’s value', () => {
    const history = [
      {
        day: '2026-09-20',
        data: { ...EMPTY_SNAPSHOT_DATA, readings: [{ id: 'neon_compute' as const, used: 40, source: 'neon_api' as const }] },
      },
    ]
    const [v] = buildMeterViews({
      readings: [{ id: 'neon_compute', used: 52, source: 'neon_api' }],
      history,
      userId: 'u1',
      now: NOW,
    })
    expect(v?.projected).toBeCloseTo(52 + 2 * 4.5, 5)
    expect(v?.projectedFraction).toBeCloseTo(0.61, 2)
  })
})

describe('snapshot data', () => {
  it('bad rows degrade to empty data', () => {
    expect(parseSnapshotData({ readings: [{ id: 'nope' }] })).toEqual(EMPTY_SNAPSHOT_DATA)
    expect(parseSnapshotData(null)).toEqual(EMPTY_SNAPSHOT_DATA)
    const ok = parseSnapshotData({ readings: [{ id: 'neon_storage', used: 5, source: 'measured' }] })
    expect(ok.readings).toHaveLength(1)
    expect(ok.neon.connected).toBe(false)
  })
})

describe('format', () => {
  it('formats bytes, hours and percents', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(0.5 * GB)).toBe('512 MB')
    expect(formatBytes(5 * GB)).toBe('5 GB')
    expect(formatMeterValue('cu_hours', 12.345)).toBe('12.3 CU-h')
    expect(formatMeterValue('cpu_hours', 4)).toBe('4 CPU-h')
    expect(formatMeterValue('count', 1234567)).toBe('1,234,567')
    expect(formatPercent(0.004)).toBe('<1%')
    expect(formatPercent(0.915)).toBe('92%')
  })
})
