import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'

/**
 * v18 — token-first AI usage for /analytics: tokens by day, model and
 * feature (`kind`), plus calls, errors, 429s and average latency.
 *
 * One aggregate over the (user_id, created_at) index range grouped by
 * (day, provider, model, kind); the three breakdowns are folded from those
 * few hundred rows in memory. Signal-check skips are not model calls and
 * are left out (the existing AI usage card reports them).
 */

export interface AiUsageCounts {
  calls: number
  errors: number
  rateLimited: number
  inputTokens: number
  outputTokens: number
  /** Mean latency of successful calls, ms. */
  avgLatencyMs: number
}

export interface AiUsageDay extends Omit<AiUsageCounts, 'avgLatencyMs'> {
  date: string // YYYY-MM-DD (UTC)
}

export interface AiUsageByModel extends AiUsageCounts {
  provider: string
  model: string | null
}

export interface AiUsageByFeature extends AiUsageCounts {
  kind: string
}

export interface AiUsageBreakdown {
  days: number
  totals: AiUsageCounts
  byDay: AiUsageDay[]
  byModel: AiUsageByModel[]
  byFeature: AiUsageByFeature[]
}

interface RawRow {
  day: Date | string
  provider: string
  model: string | null
  kind: string
  calls: number | string
  errors: number | string
  rate_limited: number | string
  input: number | string
  output: number | string
  latency_sum: number | string
  latency_n: number | string
}

interface Acc {
  calls: number
  errors: number
  rateLimited: number
  inputTokens: number
  outputTokens: number
  latencySum: number
  latencyN: number
}

const emptyAcc = (): Acc => ({
  calls: 0,
  errors: 0,
  rateLimited: 0,
  inputTokens: 0,
  outputTokens: 0,
  latencySum: 0,
  latencyN: 0,
})

function add(acc: Acc, r: RawRow): Acc {
  return {
    calls: acc.calls + Number(r.calls),
    errors: acc.errors + Number(r.errors),
    rateLimited: acc.rateLimited + Number(r.rate_limited),
    inputTokens: acc.inputTokens + Number(r.input),
    outputTokens: acc.outputTokens + Number(r.output),
    latencySum: acc.latencySum + Number(r.latency_sum),
    latencyN: acc.latencyN + Number(r.latency_n),
  }
}

function counts(acc: Acc): AiUsageCounts {
  return {
    calls: acc.calls,
    errors: acc.errors,
    rateLimited: acc.rateLimited,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    avgLatencyMs: acc.latencyN > 0 ? Math.round(acc.latencySum / acc.latencyN) : 0,
  }
}

function fold<K>(rows: RawRow[], key: (r: RawRow) => K, id: (r: RawRow) => string): Map<string, { key: K; acc: Acc }> {
  const out = new Map<string, { key: K; acc: Acc }>()
  for (const r of rows) {
    const k = id(r)
    const cur = out.get(k) ?? { key: key(r), acc: emptyAcc() }
    out.set(k, { key: cur.key, acc: add(cur.acc, r) })
  }
  return out
}

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  return ((res as { rows?: T[] }).rows ?? []) as T[]
}

function isoDay(v: Date | string): string {
  if (typeof v === 'string') return v.slice(0, 10)
  return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())).toISOString().slice(0, 10)
}

const byTokensThenCalls = (a: AiUsageCounts, b: AiUsageCounts) =>
  b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) || b.calls - a.calls

export async function aiUsageBreakdown(userId: string, days = 30): Promise<AiUsageBreakdown> {
  const since = new Date(Date.now() - days * 86_400_000)
  const ok = sql`${aiCallLogs.status} = 'ok'`
  const res = await db.execute(sql`
    select
      date_trunc('day', ${aiCallLogs.createdAt} at time zone 'UTC')::date as day,
      ${aiCallLogs.provider} as provider,
      ${aiCallLogs.model} as model,
      ${aiCallLogs.kind} as kind,
      count(*)::int as calls,
      count(*) filter (where ${aiCallLogs.status} = 'error')::int as errors,
      count(*) filter (where ${aiCallLogs.status} = 'rate_limited' or ${aiCallLogs.httpStatus} = 429)::int as rate_limited,
      coalesce(sum(${aiCallLogs.promptTokens}), 0)::int as input,
      coalesce(sum(${aiCallLogs.completionTokens}), 0)::int as output,
      coalesce(sum(${aiCallLogs.latencyMs}) filter (where ${ok}), 0)::bigint as latency_sum,
      count(${aiCallLogs.latencyMs}) filter (where ${ok})::int as latency_n
    from ${aiCallLogs}
    where ${aiCallLogs.userId} = ${userId}
      and ${aiCallLogs.createdAt} >= ${since}
      and ${aiCallLogs.status} <> 'skipped'
    group by 1, 2, 3, 4
  `)
  const rows = toRows<RawRow>(res)

  const total = rows.reduce(add, emptyAcc())

  const dayMap = fold(rows, (r) => isoDay(r.day), (r) => isoDay(r.day))
  const byDay: AiUsageDay[] = []
  const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()))
  const last = isoDay(new Date())
  while (isoDay(cursor) <= last) {
    const date = isoDay(cursor)
    const acc = dayMap.get(date)?.acc ?? emptyAcc()
    byDay.push({
      date,
      calls: acc.calls,
      errors: acc.errors,
      rateLimited: acc.rateLimited,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const byModel: AiUsageByModel[] = [
    ...fold(rows, (r) => ({ provider: r.provider, model: r.model }), (r) => `${r.provider}\u0000${r.model ?? ''}`).values(),
  ]
    .map(({ key, acc }) => ({ ...key, ...counts(acc) }))
    .sort(byTokensThenCalls)

  const byFeature: AiUsageByFeature[] = [...fold(rows, (r) => r.kind, (r) => r.kind).values()]
    .map(({ key, acc }) => ({ kind: key, ...counts(acc) }))
    .sort(byTokensThenCalls)

  return { days, totals: counts(total), byDay, byModel, byFeature }
}
