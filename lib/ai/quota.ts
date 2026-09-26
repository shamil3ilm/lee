import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs, aiQuotaSnapshots } from '@/lib/db/schema'
import { computeQuotaStatus, type LocalUsage, type QuotaStatus } from './quota-compute'
import { freeTierLimitFor } from './quota-limits'

/**
 * Quota guard + meters.
 *
 * `quotaStatus(userId, provider, model)` tells later routing how close a
 * model is to its free-tier limit (ok / warn ≥70% / critical ≥90% /
 * exhausted), so it can switch models before a hard 429. Nothing routes on
 * it yet.
 *
 * Usage comes from one aggregate over ai_call_logs (index
 * ai_call_logs(user_id, created_at)); limits come from the latest provider
 * snapshot when its window is open, else from published free-tier constants.
 */

export type { QuotaStatus, QuotaLevel, QuotaDimension } from './quota-compute'

const MIN_BILLED_AUDIO_SECONDS = 10
// Rows that reached the provider and count against its quota.
const COUNTED = sql`${aiCallLogs.status} in ('ok', 'error')`

/** Midnight America/Los_Angeles (Gemini's RPD reset) at or before `now`. */
export function pacificMidnight(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000 + now.getMilliseconds()
  return new Date(now.getTime() - elapsed)
}

interface UsageRow {
  provider: string
  model: string
  req_24h: number | string
  req_pt: number | string
  tok_24h: number | string
  tok_pt: number | string
  req_min: number | string
  tok_min: number | string
  audio_hour: number | string
  audio_24h: number | string
  audio_pt: number | string
}

async function loadLocalUsage(
  userId: string,
  now: Date,
  only?: { provider: string; model: string },
): Promise<UsageRow[]> {
  const dayAgo = new Date(now.getTime() - 86_400_000)
  const pt = pacificMidnight(now)
  const since = pt < dayAgo ? pt : dayAgo
  const minuteAgo = new Date(now.getTime() - 60_000)
  const hourAgo = new Date(now.getTime() - 3_600_000)
  const tokens = sql`coalesce(${aiCallLogs.promptTokens}, 0) + coalesce(${aiCallLogs.completionTokens}, 0)`
  const isAudio = sql`(${aiCallLogs.audioSeconds} is not null or ${aiCallLogs.inputBytes} is not null)`
  const billed = sql`greatest(coalesce(${aiCallLogs.audioSeconds}, 0), ${MIN_BILLED_AUDIO_SECONDS})`
  const filter = only
    ? sql`and ${aiCallLogs.provider} = ${only.provider} and ${aiCallLogs.model} = ${only.model}`
    : sql``
  const res = await db.execute(sql`
    select
      ${aiCallLogs.provider} as provider,
      ${aiCallLogs.model} as model,
      count(*) filter (where ${COUNTED} and ${aiCallLogs.createdAt} >= ${dayAgo})::int as req_24h,
      count(*) filter (where ${COUNTED} and ${aiCallLogs.createdAt} >= ${pt})::int as req_pt,
      coalesce(sum(${tokens}) filter (where ${aiCallLogs.createdAt} >= ${dayAgo}), 0)::int as tok_24h,
      coalesce(sum(${tokens}) filter (where ${aiCallLogs.createdAt} >= ${pt}), 0)::int as tok_pt,
      count(*) filter (where ${COUNTED} and ${aiCallLogs.createdAt} >= ${minuteAgo})::int as req_min,
      coalesce(sum(${tokens}) filter (where ${aiCallLogs.createdAt} >= ${minuteAgo}), 0)::int as tok_min,
      coalesce(sum(${billed}) filter (where ${COUNTED} and ${isAudio} and ${aiCallLogs.createdAt} >= ${hourAgo}), 0)::float as audio_hour,
      coalesce(sum(${billed}) filter (where ${COUNTED} and ${isAudio} and ${aiCallLogs.createdAt} >= ${dayAgo}), 0)::float as audio_24h,
      coalesce(sum(${billed}) filter (where ${COUNTED} and ${isAudio} and ${aiCallLogs.createdAt} >= ${pt}), 0)::float as audio_pt
    from ${aiCallLogs}
    where ${aiCallLogs.userId} = ${userId}
      and ${aiCallLogs.createdAt} >= ${since}
      and ${aiCallLogs.model} is not null
      ${filter}
    group by ${aiCallLogs.provider}, ${aiCallLogs.model}
  `)
  return toRows<UsageRow>(res)
}

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  return ((res as { rows?: T[] }).rows ?? []) as T[]
}

function toLocalUsage(row: UsageRow | undefined, pacificDay: boolean): LocalUsage {
  const n = (v: number | string | undefined) => Number(v ?? 0)
  return {
    requestsDay: n(pacificDay ? row?.req_pt : row?.req_24h),
    tokensDay: n(pacificDay ? row?.tok_pt : row?.tok_24h),
    requestsMinute: n(row?.req_min),
    tokensMinute: n(row?.tok_min),
    audioSecondsHour: n(row?.audio_hour),
    audioSecondsDay: n(pacificDay ? row?.audio_pt : row?.audio_24h),
  }
}

type SnapshotRow = typeof aiQuotaSnapshots.$inferSelect

function status(
  provider: string,
  model: string,
  row: UsageRow | undefined,
  snap: SnapshotRow | undefined,
  now: Date,
): QuotaStatus {
  const limit = freeTierLimitFor(provider, model)
  return computeQuotaStatus({
    provider,
    model,
    limit,
    local: toLocalUsage(row, limit?.dayWindow === 'midnight_pacific'),
    snapshot: snap ?? null,
    now,
  })
}

/** How close (user, provider, model) is to its free-tier limits right now. */
export async function quotaStatus(
  userId: string,
  provider: string,
  model: string,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  const [rows, snaps] = await Promise.all([
    loadLocalUsage(userId, now, { provider, model }),
    db
      .select()
      .from(aiQuotaSnapshots)
      .where(
        and(
          eq(aiQuotaSnapshots.userId, userId),
          eq(aiQuotaSnapshots.provider, provider),
          eq(aiQuotaSnapshots.model, model),
        ),
      )
      .limit(1),
  ])
  return status(provider, model, rows[0], snaps[0], now)
}

/**
 * Quota meters for every model the user called today or has a snapshot
 * for. Models with no known limit are left out. Highest usage first.
 */
export async function quotaMeters(userId: string, now: Date = new Date()): Promise<QuotaStatus[]> {
  const [rows, snaps] = await Promise.all([
    loadLocalUsage(userId, now),
    db.select().from(aiQuotaSnapshots).where(eq(aiQuotaSnapshots.userId, userId)),
  ])
  const key = (p: string, m: string) => `${p}\u0000${m}`
  const usage = new Map(rows.map((r) => [key(r.provider, r.model), r]))
  const snapshots = new Map(snaps.map((s) => [key(s.provider, s.model), s]))
  const keys = new Set([...usage.keys(), ...snapshots.keys()])
  return [...keys]
    .map((k) => {
      const [provider, model] = k.split('\u0000') as [string, string]
      return status(provider, model, usage.get(k), snapshots.get(k), now)
    })
    .filter((s) => s.level !== 'unknown')
    .sort((a, b) => b.fraction - a.fraction || a.model.localeCompare(b.model))
}
