import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  activities,
  aiCallLogs,
  applications,
  discoveries,
  expenses,
} from '@/lib/db/schema'
import * as expensesQ from '@/lib/db/queries/expenses'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'

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
  // v10 — signal-check + rating aggregates per (provider, kind).
  // `skipRate` in [0, 1]; `ratingAvg` null when no ratings exist.
  skipRate: number
  ratingAvg: number | null
  ratingCount: number
}

export interface AIDailyCostBar {
  date: string // YYYY-MM-DD
  calls: number
  cost: number
}

export interface AISignalCheckBar {
  // Per-kind aggregate of proceeded (signal check passed OR no gate) vs
  // skipped (gate refused the call). Groups by `kind` alone — the chart
  // doesn't care about provider for skip analytics.
  kind: string
  proceeded: number
  skipped: number
}

// v10.1 — per (kind, promptVersion) aggregation so analytics can spot which
// prompt version is performing best. `ratingAvg` is null when the version
// has no rated calls; `avgLatencyMs` is 0 for kinds that don't record latency.
// (Uses `ratingAvg` for naming consistency with AIUsageRow above.)
export interface AIPromptVersionRow {
  kind: string
  promptVersion: string
  calls: number
  ratingAvg: number | null
  ratingCount: number
  avgLatencyMs: number
}

export interface AIUsageStats {
  rows: AIUsageRow[]
  totalCalls: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalEstimatedCostUsd: number
  byDay: AIDailyCostBar[]
  // v10 — overall skip rate + average rating so header widgets and analytics
  // callers can show a single top-line metric without re-aggregating.
  signalSkipRate: number
  ratingAvg: number | null
  signalCheckByKind: AISignalCheckBar[]
  // v10.1 — per-prompt-version breakdown. Sorted by kind, then by version so
  // the table reads top-to-bottom as a version history per feature.
  byPromptVersion: AIPromptVersionRow[]
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

  // Per-(provider, kind) aggregation. v10 extends this to pull skip counts
  // and rating averages in the same pass so the per-row breakdown table
  // can render skip % + avg rating without extra round trips.
  const groupRows = await db
    .select({
      provider: aiCallLogs.provider,
      kind: aiCallLogs.kind,
      calls: sql<number>`count(*)::int`,
      promptTokens: sql<number>`coalesce(sum(${aiCallLogs.promptTokens}), 0)::int`,
      completionTokens: sql<number>`coalesce(sum(${aiCallLogs.completionTokens}), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${aiCallLogs.latencyMs}), 0)::int`,
      skipped: sql<number>`sum(case when ${aiCallLogs.signalCheckPassed} = false then 1 else 0 end)::int`,
      ratingAvg: sql<number | null>`avg(${aiCallLogs.userRating})::float`,
      ratingCount: sql<number>`count(${aiCallLogs.userRating})::int`,
    })
    .from(aiCallLogs)
    .where(sql`${aiCallLogs.userId} = ${userId} and ${aiCallLogs.createdAt} >= ${since}`)
    .groupBy(aiCallLogs.provider, aiCallLogs.kind)

  const rows: AIUsageRow[] = groupRows
    .map((r) => {
      const promptTokens = Number(r.promptTokens)
      const completionTokens = Number(r.completionTokens)
      const calls = Number(r.calls)
      const skipped = Number(r.skipped)
      const ratingCount = Number(r.ratingCount)
      const ratingAvgRaw = r.ratingAvg == null ? null : Number(r.ratingAvg)
      return {
        provider: r.provider,
        kind: r.kind,
        calls,
        promptTokens,
        completionTokens,
        avgLatencyMs: Number(r.avgLatencyMs),
        estimatedCostUsd: estimateCostUsd(r.provider, promptTokens, completionTokens),
        skipRate: calls > 0 ? skipped / calls : 0,
        ratingAvg:
          ratingCount > 0 && ratingAvgRaw != null
            ? Math.round(ratingAvgRaw * 100) / 100
            : null,
        ratingCount,
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

  // v10 — compute overall skip rate and average rating across the window.
  // Grouped-by-kind breakdown for the stacked bar chart.
  const skipRows = await db
    .select({
      kind: aiCallLogs.kind,
      total: sql<number>`count(*)::int`,
      skipped: sql<number>`sum(case when ${aiCallLogs.signalCheckPassed} = false then 1 else 0 end)::int`,
    })
    .from(aiCallLogs)
    .where(sql`${aiCallLogs.userId} = ${userId} and ${aiCallLogs.createdAt} >= ${since}`)
    .groupBy(aiCallLogs.kind)
  const signalCheckByKind: AISignalCheckBar[] = skipRows
    .map((r) => {
      const total = Number(r.total)
      const skipped = Number(r.skipped)
      return { kind: r.kind, proceeded: total - skipped, skipped }
    })
    .sort((a, b) => b.skipped + b.proceeded - (a.skipped + a.proceeded))

  const totalCalls = rows.reduce((s, r) => s + r.calls, 0)
  const totalSkipped = signalCheckByKind.reduce((s, r) => s + r.skipped, 0)
  const signalSkipRate = totalCalls > 0 ? totalSkipped / totalCalls : 0

  const totalRatingSum = rows.reduce(
    (s, r) => s + (r.ratingAvg != null ? r.ratingAvg * r.ratingCount : 0),
    0,
  )
  const totalRatingCount = rows.reduce((s, r) => s + r.ratingCount, 0)
  const ratingAvg =
    totalRatingCount > 0 ? Math.round((totalRatingSum / totalRatingCount) * 100) / 100 : null

  // v10.1 — per (kind, promptVersion) breakdown. Rows with a null
  // promptVersion (older logs from before this column existed) are surfaced
  // under a synthetic 'unversioned' label so the table remains complete.
  const versionRows = await db
    .select({
      kind: aiCallLogs.kind,
      promptVersion: aiCallLogs.promptVersion,
      calls: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${aiCallLogs.latencyMs}), 0)::int`,
      ratingAvg: sql<number | null>`avg(${aiCallLogs.userRating})::float`,
      ratingCount: sql<number>`count(${aiCallLogs.userRating})::int`,
    })
    .from(aiCallLogs)
    .where(sql`${aiCallLogs.userId} = ${userId} and ${aiCallLogs.createdAt} >= ${since}`)
    .groupBy(aiCallLogs.kind, aiCallLogs.promptVersion)
  const byPromptVersion: AIPromptVersionRow[] = versionRows
    .map((r) => {
      const ratingCount = Number(r.ratingCount)
      const ratingAvgRaw = r.ratingAvg == null ? null : Number(r.ratingAvg)
      return {
        kind: r.kind,
        promptVersion: r.promptVersion ?? 'unversioned',
        calls: Number(r.calls),
        avgLatencyMs: Number(r.avgLatencyMs),
        ratingAvg:
          ratingCount > 0 && ratingAvgRaw != null
            ? Math.round(ratingAvgRaw * 100) / 100
            : null,
        ratingCount,
      }
    })
    .sort((a, b) =>
      a.kind === b.kind
        ? a.promptVersion.localeCompare(b.promptVersion)
        : a.kind.localeCompare(b.kind),
    )

  return {
    rows,
    totalCalls,
    totalPromptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
    totalCompletionTokens: rows.reduce((s, r) => s + r.completionTokens, 0),
    totalEstimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
    byDay,
    signalSkipRate,
    ratingAvg,
    signalCheckByKind,
    byPromptVersion,
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

// ---------------------------------------------------------------------------
// v7 — Expense analytics. Thin wrappers around the expenses/budgets query
// layer, shaped to feed straight into the analytics cards & CSV export.
// ---------------------------------------------------------------------------

export interface MonthlyExpenseCategoryPoint {
  category: string
  totalCents: number
}

export interface MonthlyExpenseBar {
  month: string // YYYY-MM
  totalCents: number
  perCategory: MonthlyExpenseCategoryPoint[]
}

/**
 * Total spend per (month, category) over the last N calendar months. Wraps
 * expenses.sumByMonth so the analytics-card component doesn't reach into
 * the queries directly.
 */
export async function monthlyExpenses(
  userId: string,
  months = 6,
): Promise<MonthlyExpenseBar[]> {
  return expensesQ.sumByMonth(userId, months)
}

export interface BudgetVsActualRow {
  category: string
  budgetCents: number
  actualCents: number
  currency: string
}

/** Returns `YYYY-MM` for the current month in UTC. */
function currentMonthKey(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Compare each category's monthly budget cap against month-to-date spend.
 * Includes every category with either a budget OR any spend that month so
 * over-budget items surface even when the user never set a cap.
 */
export async function budgetVsActual(
  userId: string,
  month?: string,
): Promise<BudgetVsActualRow[]> {
  const monthKey = month ?? currentMonthKey()
  const [budgets, actuals] = await Promise.all([
    budgetsQ.list(userId),
    expensesQ.sumByCategory(userId, monthKey),
  ])
  const byCategory = new Map<string, BudgetVsActualRow>()
  for (const b of budgets) {
    byCategory.set(b.category, {
      category: b.category,
      budgetCents: b.monthlyCapCents,
      actualCents: 0,
      currency: b.currency,
    })
  }
  for (const a of actuals) {
    const existing = byCategory.get(a.category)
    if (existing) {
      existing.actualCents = a.totalCents
    } else {
      byCategory.set(a.category, {
        category: a.category,
        budgetCents: 0,
        actualCents: a.totalCents,
        currency: 'AED',
      })
    }
  }
  return Array.from(byCategory.values()).sort(
    (a, b) => b.actualCents - a.actualCents || b.budgetCents - a.budgetCents,
  )
}

// ---------------------------------------------------------------------------
// v8 — Expense analytics extensions
// ---------------------------------------------------------------------------

export interface MonthComparisonRow {
  category: string
  currentCents: number
  previousCents: number
  deltaCents: number
  // Percent change; null when previous is 0 (would divide by zero).
  deltaPercent: number | null
}

/**
 * Compare per-category spend between two months. Returns rows for every
 * category that had spend in either month; missing sides read as 0. Sorted
 * by absolute delta desc so the biggest movers surface first.
 */
export async function monthOverMonthByCategory(
  userId: string,
  month: string,
  prevMonth: string,
): Promise<MonthComparisonRow[]> {
  const [current, previous] = await Promise.all([
    expensesQ.sumByCategory(userId, month),
    expensesQ.sumByCategory(userId, prevMonth),
  ])
  const map = new Map<string, MonthComparisonRow>()
  for (const c of current) {
    map.set(c.category, {
      category: c.category,
      currentCents: c.totalCents,
      previousCents: 0,
      deltaCents: c.totalCents,
      deltaPercent: null,
    })
  }
  for (const p of previous) {
    const existing = map.get(p.category)
    if (existing) {
      existing.previousCents = p.totalCents
      existing.deltaCents = existing.currentCents - p.totalCents
      existing.deltaPercent =
        p.totalCents === 0
          ? null
          : Math.round(((existing.currentCents - p.totalCents) / p.totalCents) * 1000) / 10
    } else {
      map.set(p.category, {
        category: p.category,
        currentCents: 0,
        previousCents: p.totalCents,
        deltaCents: -p.totalCents,
        deltaPercent: p.totalCents === 0 ? null : -100,
      })
    }
  }
  // Compute deltaPercent for rows that had no previous entry (currently null).
  for (const row of map.values()) {
    if (row.deltaPercent === null && row.previousCents > 0) {
      row.deltaPercent =
        Math.round(((row.currentCents - row.previousCents) / row.previousCents) * 1000) / 10
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents),
  )
}

export interface CategoryTrendRow {
  month: string // YYYY-MM
  category: string
  totalCents: number
}

/**
 * Long-format (month, category, totalCents) grid over the trailing `months`
 * calendar months. Consumers (line chart, CSV export) pivot as needed.
 * Includes every (month, category) pair that had spend; empty cells omitted.
 */
export async function expenseCategoryTrend(
  userId: string,
  months = 6,
): Promise<CategoryTrendRow[]> {
  const bars = await expensesQ.sumByMonth(userId, months)
  const rows: CategoryTrendRow[] = []
  for (const bar of bars) {
    for (const c of bar.perCategory) {
      rows.push({ month: bar.month, category: c.category, totalCents: c.totalCents })
    }
  }
  return rows
}

export interface VendorRow {
  vendor: string
  totalCents: number
  count: number
}

/**
 * Top vendors by aggregate spend over the trailing `months` months. Vendor
 * comparison is case-insensitive so "Netflix" and "netflix" collapse — the
 * label used is the vendor casing from the most recent expense.
 * Rows with a null/empty vendor collapse under 'Unknown'.
 */
export async function topVendors(
  userId: string,
  months = 3,
  limit = 10,
): Promise<VendorRow[]> {
  if (months < 1) return []
  const now = new Date()
  // Cut-off = first day of the (months-1) months ago period.
  const oldest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const oldestKey = `${oldest.getUTCFullYear()}-${String(oldest.getUTCMonth() + 1).padStart(2, '0')}-01`

  const rows = await db
    .select({
      vendor: expenses.vendor,
      amountCents: expenses.amountCents,
      date: expenses.date,
    })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), gte(expenses.date, oldestKey)))

  interface Agg {
    displayName: string
    latestDate: string
    totalCents: number
    count: number
  }
  const byKey = new Map<string, Agg>()
  for (const r of rows) {
    const displayName = (r.vendor ?? '').trim() || 'Unknown'
    const key = displayName.toLowerCase()
    const existing = byKey.get(key)
    if (existing) {
      existing.totalCents += Number(r.amountCents)
      existing.count += 1
      // Prefer the label of the most recent expense — dates are ISO strings,
      // lex compare works.
      if (String(r.date) > existing.latestDate) {
        existing.latestDate = String(r.date)
        existing.displayName = displayName
      }
    } else {
      byKey.set(key, {
        displayName,
        latestDate: String(r.date),
        totalCents: Number(r.amountCents),
        count: 1,
      })
    }
  }
  return Array.from(byKey.values())
    .map((v) => ({ vendor: v.displayName, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents || b.count - a.count)
    .slice(0, limit)
}

export interface AdherenceCell {
  month: string // YYYY-MM
  category: string
  budgetCents: number
  spentCents: number
  adherence: 'under' | 'over'
}

/**
 * Grid of (month, category) adherence over the last N months. Only surfaces
 * categories that had either a budget or spend in the window — categories
 * with neither are omitted. Budgets are current values (spec keeps history
 * out of scope for v8; deferred). Uses month-end cutoff so a partial
 * current-month still classifies fairly.
 */
export async function budgetAdherenceHistory(
  userId: string,
  months = 12,
): Promise<AdherenceCell[]> {
  if (months < 1) return []
  const [bars, budgets] = await Promise.all([
    expensesQ.sumByMonth(userId, months),
    budgetsQ.list(userId),
  ])
  const budgetByCategory = new Map(budgets.map((b) => [b.category, b.monthlyCapCents]))
  const cells: AdherenceCell[] = []
  for (const bar of bars) {
    // Union of categories with either spend or a budget cap. Categories
    // with a cap but zero spend are still worth surfacing (green cell).
    const seen = new Set<string>()
    for (const c of bar.perCategory) seen.add(c.category)
    for (const cat of budgetByCategory.keys()) seen.add(cat)
    for (const category of seen) {
      const spentCents = bar.perCategory.find((p) => p.category === category)?.totalCents ?? 0
      const budgetCents = budgetByCategory.get(category) ?? 0
      // Skip cells with no cap AND no spend — nothing to say.
      if (budgetCents === 0 && spentCents === 0) continue
      const adherence: AdherenceCell['adherence'] =
        budgetCents === 0 || spentCents > budgetCents ? 'over' : 'under'
      cells.push({ month: bar.month, category, budgetCents, spentCents, adherence })
    }
  }
  return cells
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
  currentMonthKey,
}
