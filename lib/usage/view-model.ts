import { NEON_CONSOLE_URL, VERCEL_USAGE_DASHBOARD_URL } from './limits'
import {
  meterFraction,
  meterLevel,
  METER_DEFS,
  projectEndOfMonth,
  type MeterDef,
  type MeterId,
  type MeterLevel,
  type MeterReading,
  type MeterSource,
  type TrendPoint,
} from './meters'
import type { UsageSnapshotData } from './snapshot-data'

/**
 * Pure view model for Settings › Usage (client-safe): one row per meter
 * with value / limit, % used, projected end-of-month value from the daily
 * trend, level and a plain-words source.
 */

export interface MeterView {
  id: MeterId
  label: string
  group: MeterDef['group']
  help: string
  unit: MeterDef['unit']
  used: number | null
  limit: number | null
  fraction: number | null
  level: MeterLevel
  projected: number | null
  projectedFraction: number | null
  source: MeterSource
  sourceLabel: string
  /** Where to see or fix it (vendor dashboard / docs). */
  link: { href: string; label: string } | null
  docsUrl: string | null
  lastVerified: string | null
}

export function sourceLabel(source: MeterSource, def: MeterDef): string {
  switch (source) {
    case 'measured':
      return 'Measured'
    case 'neon_api':
      return 'From Neon API'
    case 'estimated':
      return 'Estimated'
    case 'unavailable':
      return def.group === 'neon' ? 'Not measured: add a Neon API key' : 'Not available'
    case 'vendor_dashboard':
      return 'Not available on Hobby: see Vercel dashboard'
    case 'placeholder':
      return 'Placeholder: nothing ships yet'
  }
}

function linkFor(def: MeterDef, source: MeterSource): MeterView['link'] {
  if (source === 'vendor_dashboard') return { href: VERCEL_USAGE_DASHBOARD_URL, label: 'Vercel usage' }
  if (def.group === 'neon' && source === 'unavailable') return { href: '/settings/ai#service-keys', label: 'Add key' }
  if (def.group === 'neon') return { href: NEON_CONSOLE_URL, label: 'Neon console' }
  if (def.id === 'queue_dead' || def.id === 'queue_backlog') return { href: '/settings/jobs', label: 'Background jobs' }
  return null
}

export interface BuildArgs {
  /** Readings in display order (latest snapshot, with live overrides applied). */
  readings: readonly MeterReading[]
  /** Past snapshots (oldest first) for the trend. */
  history: readonly { day: string; data: UsageSnapshotData }[]
  userId: string
  now: Date
}

function trendFor(id: MeterId, args: BuildArgs): TrendPoint[] {
  const points: TrendPoint[] = []
  for (const h of args.history) {
    const r = [...h.data.readings, ...(h.data.userReadings[args.userId] ?? [])].find((x) => x.id === id)
    if (r && r.used !== null) points.push({ day: h.day, used: r.used })
  }
  return points
}

export function buildMeterViews(args: BuildArgs): MeterView[] {
  const today = args.now.toISOString().slice(0, 10)
  return args.readings.map((r) => {
    const def = METER_DEFS[r.id]
    const limit = def.limit?.value ?? null
    const fraction = meterFraction(r.used, limit)
    const trend = trendFor(r.id, args).filter((p) => p.day !== today)
    const withToday = r.used === null ? trend : [...trend, { day: today, used: r.used }]
    const projected = r.used === null || limit === null ? null : projectEndOfMonth(withToday, def.kind, args.now)
    return {
      id: r.id,
      label: def.label,
      group: def.group,
      help: def.help,
      unit: def.unit,
      used: r.used,
      limit,
      fraction,
      level: meterLevel(fraction),
      projected,
      projectedFraction: meterFraction(projected, limit),
      source: r.source,
      sourceLabel: sourceLabel(r.source, def),
      link: linkFor(def, r.source),
      docsUrl: def.limit?.docsUrl ?? null,
      lastVerified: def.limit?.lastVerified ?? null,
    }
  })
}

/** Replace readings by id (live values win over the stored snapshot). */
export function withLive(readings: readonly MeterReading[], live: readonly MeterReading[]): MeterReading[] {
  const byId = new Map(live.map((r) => [r.id, r]))
  const merged = readings.map((r) => byId.get(r.id) ?? r)
  const missing = live.filter((l) => !readings.some((r) => r.id === l.id))
  return [...merged, ...missing]
}
