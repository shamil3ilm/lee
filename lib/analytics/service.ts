import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, aiCallLogs, applications, discoveries } from '@/lib/db/schema'

/**
 * Normalize the row-set that a Drizzle `db.execute()` returns. postgres-js
 * returns an array directly; PGlite returns `{ rows: [] }`. Callers should
 * always iterate the return value of this helper, never the raw execute
 * result — otherwise the same query silently returns different shapes in
 * production vs. tests.
 */
function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown }).rows
    if (Array.isArray(rows)) return rows as T[]
  }
  return []
}

/**
 * Analytics service — pure query functions that aggregate the tracking data
 * already in the database (applications, activities, discoveries,
 * interview_stages). No schema changes; each function is scoped by userId
 * and returns typed rows suitable for both chart rendering and CSV export.
 *
 * SQL: raw `sql` templates are used for GROUP BY / DATE_TRUNC where the
 * Drizzle DSL would be noisier than the SQL itself. Every query uses
 * parameter binding — no string interpolation of user input.
 */

export interface SourceFunnelRow {
  source: string
  applied: number
  screened: number
  interviewed: number
  offered: number
  rejected: number
}

export interface ResponseTimeBucket {
  bucketDays: string
  count: number
}

export interface OutcomeStat {
  median: number
  p90: number
  count: number
}

export interface TimeToOutcomeStats {
  offer: OutcomeStat
  rejection: OutcomeStat
}

export type CalibrationOutcome =
  | 'saved'
  | 'applied'
  | 'interviewed'
  | 'offered'
  | 'rejected'
  | 'dismissed'

export interface CalibrationPoint {
  matchScore: number
  outcome: CalibrationOutcome
  count: number
}

export interface WeeklyBar {
  weekStart: string
  count: number
}

export interface StatusSlice {
  status: string
  count: number
}

// Ordered stages used to classify an application into the funnel; a row's
// "furthest reached" stage is the max of these that matches its status.
const SCREENED_STATUSES = new Set(['screen', 'interview', 'offer'])
const INTERVIEWED_STATUSES = new Set(['interview', 'offer'])

/**
 * Group applications by source and count how many reached each funnel stage.
 * Status buckets are inclusive of downstream stages so numbers monotonically
 * decrease from Applied → Offer, matching the FunnelWidget convention.
 * Applications with a null source are grouped under `unknown` so nothing is
 * silently dropped.
 */
export async function sourceFunnel(userId: string): Promise<SourceFunnelRow[]> {
  const rows = await db
    .select({ source: applications.source, status: applications.status })
    .from(applications)
    .where(eq(applications.userId, userId))

  const byKey = new Map<string, SourceFunnelRow>()
  for (const r of rows) {
    const key = r.source ?? 'unknown'
    const existing = byKey.get(key) ?? {
      source: key,
      applied: 0,
      screened: 0,
      interviewed: 0,
      offered: 0,
      rejected: 0,
    }
    if (r.status === 'applied' || SCREENED_STATUSES.has(r.status)) existing.applied += 1
    if (SCREENED_STATUSES.has(r.status)) existing.screened += 1
    if (INTERVIEWED_STATUSES.has(r.status)) existing.interviewed += 1
    if (r.status === 'offer') existing.offered += 1
    if (r.status === 'rejected') existing.rejected += 1
    byKey.set(key, existing)
  }
  return Array.from(byKey.values()).sort((a, b) => b.applied - a.applied)
}

// Bucket definitions in display order; the last bucket has no upper bound.
const RESPONSE_BUCKETS: ReadonlyArray<{ label: string; min: number; max: number | null }> = [
  { label: '0-3', min: 0, max: 3 },
  { label: '4-7', min: 4, max: 7 },
  { label: '8-14', min: 8, max: 14 },
  { label: '15-30', min: 15, max: 30 },
  { label: '30+', min: 31, max: null },
]

/**
 * Distribution of days from an application's applied_at to the first
 * inbound signal (email OR a status_change away from 'saved'). Applications
 * without applied_at or without any qualifying activity are excluded.
 */
export async function responseTimeDistribution(
  userId: string,
): Promise<ResponseTimeBucket[]> {
  const raw = await db.execute(sql`
    with first_response as (
      select
        a.id as application_id,
        a.applied_at as applied_at,
        min(act.created_at) as first_at
      from ${applications} a
      join ${activities} act on act.application_id = a.id
      where a.user_id = ${userId}
        and a.applied_at is not null
        and (
          act.kind = 'email'
          or (act.kind = 'status_change' and act.payload->>'to' <> 'saved')
        )
      group by a.id, a.applied_at
    )
    select extract(day from (first_at - applied_at))::int as days
    from first_response
    where first_at >= applied_at
  `)
  const rows = toRows<{ days: number | string }>(raw)

  const counts = new Map<string, number>(RESPONSE_BUCKETS.map((b) => [b.label, 0]))
  for (const row of rows) {
    const d = Number(row.days)
    const bucket = RESPONSE_BUCKETS.find(
      (b) => d >= b.min && (b.max === null || d <= b.max),
    )
    if (bucket) counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1)
  }
  return RESPONSE_BUCKETS.map((b) => ({ bucketDays: b.label, count: counts.get(b.label) ?? 0 }))
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

/**
 * Median and p90 days from applied_at → first status_change into `offer` or
 * `rejected`. Applications currently in those states without a status_change
 * activity (legacy data) are ignored because we have no timestamp to measure
 * against.
 */
export async function timeToOutcome(userId: string): Promise<TimeToOutcomeStats> {
  const raw = await db.execute(sql`
    select
      act.payload->>'to' as outcome,
      extract(day from (min(act.created_at) - a.applied_at))::int as days
    from ${applications} a
    join ${activities} act on act.application_id = a.id
    where a.user_id = ${userId}
      and a.applied_at is not null
      and act.kind = 'status_change'
      and act.payload->>'to' in ('offer', 'rejected')
    group by a.id, act.payload->>'to', a.applied_at
    having min(act.created_at) >= a.applied_at
  `)
  const rows = toRows<{ outcome: string; days: number | string }>(raw)

  const offerDays: number[] = []
  const rejectionDays: number[] = []
  for (const row of rows) {
    const d = Number(row.days)
    if (row.outcome === 'offer') offerDays.push(d)
    else if (row.outcome === 'rejected') rejectionDays.push(d)
  }
  offerDays.sort((a, b) => a - b)
  rejectionDays.sort((a, b) => a - b)

  return {
    offer: {
      median: Math.round(quantile(offerDays, 0.5)),
      p90: Math.round(quantile(offerDays, 0.9)),
      count: offerDays.length,
    },
    rejection: {
      median: Math.round(quantile(rejectionDays, 0.5)),
      p90: Math.round(quantile(rejectionDays, 0.9)),
      count: rejectionDays.length,
    },
  }
}

function classifyDiscoveryOutcome(
  discoveryStatus: string,
  applicationStatus: string | null,
): CalibrationOutcome {
  if (applicationStatus === 'offer') return 'offered'
  if (applicationStatus === 'rejected') return 'rejected'
  if (applicationStatus === 'interview' || applicationStatus === 'screen') return 'interviewed'
  if (applicationStatus === 'applied') return 'applied'
  if (applicationStatus === 'saved') return 'saved'
  if (discoveryStatus === 'dismissed') return 'dismissed'
  if (discoveryStatus === 'saved') return 'saved'
  return 'saved'
}

/**
 * Correlate discovery match scores with the outcome the discovery reached
 * (either via its linked application's status, or the discovery's own
 * dismissed/saved state when never converted). Rows without a match_score
 * are excluded — nothing to plot on the X axis.
 */
export async function discoveryCalibration(userId: string): Promise<CalibrationPoint[]> {
  const raw = await db.execute(sql`
    select
      d.match_score as match_score,
      d.status as discovery_status,
      a.status as application_status
    from ${discoveries} d
    left join ${applications} a on a.id = d.saved_application_id
    where d.user_id = ${userId}
      and d.match_score is not null
  `)
  const rows = toRows<{
    match_score: number | string
    discovery_status: string
    application_status: string | null
  }>(raw)

  const buckets = new Map<string, CalibrationPoint>()
  for (const row of rows) {
    const score = Number(row.match_score)
    const outcome = classifyDiscoveryOutcome(row.discovery_status, row.application_status)
    const key = `${score}:${outcome}`
    const existing = buckets.get(key)
    if (existing) existing.count += 1
    else buckets.set(key, { matchScore: score, outcome, count: 1 })
  }
  return Array.from(buckets.values()).sort((a, b) => a.matchScore - b.matchScore)
}

/**
 * Applications created per ISO week (Monday start) over the last N weeks.
 * The result always includes an entry for every week in the window, even
 * weeks with zero applications, so the chart X-axis stays continuous.
 */
export async function weeklyActivity(
  userId: string,
  weeks = 12,
): Promise<WeeklyBar[]> {
  const now = new Date()
  const oldest = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000)
  const raw = await db.execute(sql`
    select
      date_trunc('week', created_at) as week_start,
      count(*) as count
    from ${applications}
    where user_id = ${userId}
      and created_at >= ${oldest}
    group by week_start
    order by week_start asc
  `)
  const rows = toRows<{ week_start: Date | string; count: string | number }>(raw)

  const byWeek = new Map<string, number>()
  for (const row of rows) {
    // Postgres returns date_trunc('week', ts) as a timestamp-with-tz whose
    // date component is ALREADY the Monday we want — extract it directly
    // (either as an ISO date from a string, or by reading UTC year/month/day
    // from a Date) rather than re-computing from a JS Date, which would
    // shift the day when the driver renders the tz-aware value in a
    // non-UTC offset.
    const key = weekStartIsoDate(row.week_start)
    byWeek.set(key, Number(row.count))
  }

  // Fill every Monday in the window so sparse weeks still render.
  const bars: WeeklyBar[] = []
  const firstMonday = mondayIsoDate(oldest)
  const cursor = new Date(`${firstMonday}T00:00:00Z`)
  const lastMonday = mondayIsoDate(now)
  while (mondayIsoDate(cursor) <= lastMonday) {
    const key = mondayIsoDate(cursor)
    bars.push({ weekStart: key, count: byWeek.get(key) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return bars
}

function mondayIsoDate(d: Date): string {
  // Postgres `date_trunc('week', ...)` returns Monday; mirror that in JS so
  // fill-in weeks match the DB keys exactly.
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = utc.getUTCDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  utc.setUTCDate(utc.getUTCDate() + diff)
  return utc.toISOString().slice(0, 10)
}

/**
 * Extract the `YYYY-MM-DD` date part from a Postgres date_trunc('week', ...)
 * value. The driver may hand us either a JS Date (postgres-js) or a raw
 * string like `2026-09-21 00:00:00+05` (PGlite). Both encode the same Monday
 * in the source timestamp's own timezone — read that Monday directly rather
 * than reprojecting through JS Date arithmetic that can shift the day.
 */
function weekStartIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]!
    return value
  }
  const utc = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  return utc.toISOString().slice(0, 10)
}

/**
 * Current pipeline breakdown — one row per status with the number of
 * applications currently in that state. Statuses with zero applications are
 * omitted; the UI is responsible for treating an empty result as "no data".
 */
export async function statusDistribution(userId: string): Promise<StatusSlice[]> {
  const rows = await db
    .select({
      status: applications.status,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status)
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }))
}

// ---------------------------------------------------------------------------
// AI usage & cost tracking (v6.1)
// ---------------------------------------------------------------------------

export interface AIUsageRow {
  provider: string
  kind: string
  calls: number
  promptTokens: number
  completionTokens: number
  avgLatencyMs: number
  estimatedCostUsd: number
}

export interface AIDailyCostBar {
  date: string // YYYY-MM-DD
  calls: number
  cost: number
}

export interface AIUsageStats {
  rows: AIUsageRow[]
  totalCalls: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalEstimatedCostUsd: number
  byDay: AIDailyCostBar[]
}

/**
 * Hardcoded per-million-token prices. We only log (provider, kind) — not the
 * specific model — so pricing is estimated by matching provider and picking
 * a sensible default for that provider's usual model. When a provider isn't
 * in the table (or is a free tier), cost is 0.
 *
 * Prices are USD per million tokens, mirroring vendor rate cards as of
 * 2026-09. Update these when vendors change tiers — the analytics card is
 * an estimate, not billing truth.
 */
interface PriceEntry {
  inputPerM: number
  outputPerM: number
}

const AI_PRICES: Record<string, PriceEntry> = {
  // gemini defaults to flash (kind 'parse' is our shared logging kind).
  // gemini flash-lite is cheaper but we can't distinguish it from the DB
  // without a model column — use flash as the conservative estimate.
  'gemini:flash': { inputPerM: 0.075, outputPerM: 0.3 },
  'gemini:flash-lite': { inputPerM: 0.037, outputPerM: 0.15 },
  'groq:gpt-oss-20b': { inputPerM: 0.075, outputPerM: 0.3 },
  'groq:gpt-oss-120b': { inputPerM: 0.15, outputPerM: 0.6 },
}

// Provider → default model key used when the log row has no model info.
// Matches the default model each provider constructor sets today.
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  gemini: 'flash',
  groq: 'gpt-oss-20b',
}

function estimateCostUsd(provider: string, promptTokens: number, completionTokens: number): number {
  const model = PROVIDER_DEFAULT_MODEL[provider]
  if (!model) return 0
  const price = AI_PRICES[`${provider}:${model}`]
  if (!price) return 0
  return (promptTokens / 1_000_000) * price.inputPerM + (completionTokens / 1_000_000) * price.outputPerM
}

/**
 * Aggregated AI call stats for the given user over the last `days` window.
 * Groups by (provider, kind) for the tabular breakdown and by day for the
 * cost trend bar chart. Failed calls are still counted (they cost money on
 * some providers) but token totals may be null; we treat null as 0.
 */
export async function aiUsageStats(userId: string, days = 30): Promise<AIUsageStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Per-(provider, kind) aggregation
  const groupRows = await db
    .select({
      provider: aiCallLogs.provider,
      kind: aiCallLogs.kind,
      calls: sql<number>`count(*)::int`,
      promptTokens: sql<number>`coalesce(sum(${aiCallLogs.promptTokens}), 0)::int`,
      completionTokens: sql<number>`coalesce(sum(${aiCallLogs.completionTokens}), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${aiCallLogs.latencyMs}), 0)::int`,
    })
    .from(aiCallLogs)
    .where(sql`${aiCallLogs.userId} = ${userId} and ${aiCallLogs.createdAt} >= ${since}`)
    .groupBy(aiCallLogs.provider, aiCallLogs.kind)

  const rows: AIUsageRow[] = groupRows
    .map((r) => {
      const promptTokens = Number(r.promptTokens)
      const completionTokens = Number(r.completionTokens)
      return {
        provider: r.provider,
        kind: r.kind,
        calls: Number(r.calls),
        promptTokens,
        completionTokens,
        avgLatencyMs: Number(r.avgLatencyMs),
        estimatedCostUsd: estimateCostUsd(r.provider, promptTokens, completionTokens),
      }
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.calls - a.calls)

  // Daily aggregation for the trend bar chart. Group by created_at::date so
  // sparse days collapse; we back-fill missing days below.
  const dailyRaw = await db.execute(sql`
    select
      date_trunc('day', ${aiCallLogs.createdAt})::date as day,
      ${aiCallLogs.provider} as provider,
      coalesce(sum(${aiCallLogs.promptTokens}), 0)::int as prompt_tokens,
      coalesce(sum(${aiCallLogs.completionTokens}), 0)::int as completion_tokens,
      count(*)::int as calls
    from ${aiCallLogs}
    where ${aiCallLogs.userId} = ${userId}
      and ${aiCallLogs.createdAt} >= ${since}
    group by day, ${aiCallLogs.provider}
    order by day asc
  `)
  const dailyRows = toRows<{
    day: Date | string
    provider: string
    prompt_tokens: number | string
    completion_tokens: number | string
    calls: number | string
  }>(dailyRaw)

  const byDayMap = new Map<string, { calls: number; cost: number }>()
  for (const r of dailyRows) {
    const key = dayIsoDate(r.day)
    const existing = byDayMap.get(key) ?? { calls: 0, cost: 0 }
    existing.calls += Number(r.calls)
    existing.cost += estimateCostUsd(
      r.provider,
      Number(r.prompt_tokens),
      Number(r.completion_tokens),
    )
    byDayMap.set(key, existing)
  }

  // Back-fill every day in the window so the trend bar chart has a
  // continuous X axis (matching how weeklyActivity fills quiet weeks).
  const byDay: AIDailyCostBar[] = []
  const cursor = new Date(
    Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()),
  )
  const now = new Date()
  const lastDay = dayIsoDate(now)
  while (dayIsoDate(cursor) <= lastDay) {
    const key = dayIsoDate(cursor)
    const bucket = byDayMap.get(key) ?? { calls: 0, cost: 0 }
    byDay.push({ date: key, calls: bucket.calls, cost: bucket.cost })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return {
    rows,
    totalCalls: rows.reduce((s, r) => s + r.calls, 0),
    totalPromptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
    totalCompletionTokens: rows.reduce((s, r) => s + r.completionTokens, 0),
    totalEstimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
    byDay,
  }
}

function dayIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]!
    return value
  }
  const utc = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  return utc.toISOString().slice(0, 10)
}

// Re-exported so tests can exercise the pure helpers directly and the CSV
// route can reuse the same bucket labels without duplicating them.
export const _internal = {
  classifyDiscoveryOutcome,
  dayIsoDate,
  estimateCostUsd,
  mondayIsoDate,
  quantile,
  RESPONSE_BUCKETS,
  weekStartIsoDate,
  AI_PRICES,
  PROVIDER_DEFAULT_MODEL,
}
