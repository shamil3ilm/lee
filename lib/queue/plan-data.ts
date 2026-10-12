import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sources, userProfile, users } from '@/lib/db/schema'
import { isAllowedEmail } from '@/lib/auth/allowed-email'
import { MAX_ERRORS_BEFORE_SKIP } from '@/lib/discovery/service'
import { gmailAccess, googleScopesByUser, type GmailAccess } from '@/lib/google/scopes'
import { normalizePreferred } from '@/lib/regions/preferred'
import { WEEKLY_CHAIN_TYPES, activityTier, sourceCost, type ActivityTier, type PlanSource } from './capacity'
import { JOB_TYPES } from './job-types'

/**
 * DB reads for the daily plan (lib/queue/scheduler.ts): who is active, their
 * pollable sources with a cost estimate and starred-region yield, and their
 * Gmail access. A handful of set-based statements, never one per user.
 */

export interface PlanAccount {
  userId: string
  tier: ActivityTier
  gmail: GmailAccess
  sources: PlanSource[]
}

/** How far back a source's postings count toward its starred-region yield. */
export const STARRED_YIELD_DAYS = 30
/** How far back observed poll durations are averaged. */
export const COST_HISTORY_DAYS = 7

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/** Average observed poll time per source (done polls, last COST_HISTORY_DAYS). */
async function observedCosts(sourceIds: readonly string[], now: Date): Promise<Map<string, number>> {
  if (sourceIds.length === 0) return new Map()
  const since = new Date(now.getTime() - COST_HISTORY_DAYS * 86_400_000).toISOString()
  const result = await db.execute(sql`
    select payload->>'sourceId' as source_id, avg(duration_ms)::float as avg_ms
    from queue_jobs
    where type = ${JOB_TYPES.discoverySource} and status = 'done' and duration_ms is not null
      and finished_at > ${since}::timestamptz
    group by 1
  `)
  const wanted = new Set(sourceIds)
  return new Map(
    toRows<{ source_id: string | null; avg_ms: number | string | null }>(result)
      .filter((r) => r.source_id && wanted.has(r.source_id) && r.avg_ms !== null)
      .map((r) => [r.source_id!, Number(r.avg_ms)]),
  )
}

/** Postings per source in each user's starred regions (region_ids store ancestors). */
async function starredYields(starred: ReadonlyMap<string, readonly string[]>, now: Date): Promise<Map<string, number>> {
  const pairs = [...starred].flatMap(([userId, ids]) => ids.map((id) => [userId, id] as const))
  if (pairs.length === 0) return new Map()
  const since = new Date(now.getTime() - STARRED_YIELD_DAYS * 86_400_000).toISOString()
  const values = sql.join(pairs.map(([u, r]) => sql`(${u}::uuid, ${r}::text)`), sql`, `)
  const result = await db.execute(sql`
    select d.source_id, count(distinct d.id)::int as n
    from discoveries d
    join (values ${values}) as s(user_id, region_id) on s.user_id = d.user_id
    where d.created_at > ${since}::timestamptz and s.region_id = any(d.region_ids)
    group by d.source_id
  `)
  return new Map(toRows<{ source_id: string; n: number | string }>(result).map((r) => [r.source_id, Number(r.n)]))
}

/**
 * Every active (not suspended) account with its activity tier; for the
 * non-dormant ones, their pollable sources and Gmail access. `onlyUserId`
 * narrows the source reads to one account ("Run now", a returning visitor).
 */
export async function loadPlanAccounts(now: Date, onlyUserId?: string): Promise<PlanAccount[]> {
  const people = await db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(eq(users.status, 'active'))
  const accounts = people.map((p) => ({
    userId: p.id,
    owner: isAllowedEmail(p.email),
    tier: p.id === onlyUserId ? ('active' as const) : activityTier(p.lastSeenAt, p.createdAt, now),
  }))
  const planned = accounts.filter((a) => a.tier !== 'dormant' && (!onlyUserId || a.userId === onlyUserId))
  const ids = planned.map((a) => a.userId)
  if (ids.length === 0) return accounts.map((a) => ({ userId: a.userId, tier: a.tier, gmail: { read: false, send: false }, sources: [] }))

  const [srcRows, scopes, prefs] = await Promise.all([
    db
      .select({ id: sources.id, userId: sources.userId, kind: sources.kind, lastPolledAt: sources.lastPolledAt })
      .from(sources)
      .where(and(inArray(sources.userId, ids), eq(sources.enabled, true), lt(sources.errorCount, MAX_ERRORS_BEFORE_SKIP)))
      .orderBy(sources.createdAt),
    googleScopesByUser(ids),
    db
      .select({ userId: userProfile.userId, discoveryPrefs: userProfile.discoveryPrefs })
      .from(userProfile)
      .where(and(inArray(userProfile.userId, ids), gt(sql`jsonb_array_length(coalesce(${userProfile.discoveryPrefs}->'preferredRegions', '[]'::jsonb))`, 0))),
  ])
  const starred = new Map(
    prefs.map((p) => {
      const raw = (p.discoveryPrefs as { preferredRegions?: unknown } | null)?.preferredRegions
      return [p.userId, normalizePreferred(Array.isArray(raw) ? raw : []).map((r) => r.id)] as const
    }),
  )
  const [costs, yields] = await Promise.all([observedCosts(srcRows.map((s) => s.id), now), starredYields(starred, now)])
  const gmail = new Map(planned.map((a) => [a.userId, gmailAccess(scopes.get(a.userId), a.owner)]))
  const byUser = new Map<string, PlanSource[]>()
  for (const s of srcRows) {
    // Job-alert email ingestion reads Gmail: only for accounts with Gmail read access.
    if (s.kind === 'email_alert' && !gmail.get(s.userId)?.read) continue
    const list = byUser.get(s.userId) ?? []
    list.push({ id: s.id, lastPolledAt: s.lastPolledAt, starredYield: yields.get(s.id) ?? 0, costMs: sourceCost(costs.get(s.id)) })
    byUser.set(s.userId, list)
  }
  return accounts.map((a) => ({
    userId: a.userId,
    tier: a.tier,
    gmail: gmail.get(a.userId) ?? { read: false, send: false },
    sources: byUser.get(a.userId) ?? [],
  }))
}

export interface WeeklyFacts {
  /** Days since each user's last finished weekly company discovery (absent = none on record). */
  daysSinceRun: Map<string, number>
  /** Average observed duration per weekly-chain job type (last 30 days). */
  observedMs: Map<string, number>
}

/** Queue history for the weekly company chain (finished jobs are kept 14 days). */
export async function loadWeeklyFacts(now: Date): Promise<WeeklyFacts> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const types = sql.join(WEEKLY_CHAIN_TYPES.map((t) => sql`${t}`), sql`, `)
  const [last, costs] = await Promise.all([
    db.execute(sql`
      select user_id, max(finished_at) as at from queue_jobs
      where type = ${JOB_TYPES.companyDiscovery} and status = 'done' and user_id is not null
      group by user_id
    `),
    db.execute(sql`
      select type, avg(duration_ms)::float as avg_ms from queue_jobs
      where type in (${types}) and status = 'done' and duration_ms is not null and finished_at > ${since}::timestamptz
      group by type
    `),
  ])
  const daysSinceRun = new Map(
    toRows<{ user_id: string; at: Date | string }>(last).map((r) => [r.user_id, (now.getTime() - new Date(r.at).getTime()) / 86_400_000]),
  )
  const observedMs = new Map(
    toRows<{ type: string; avg_ms: number | string | null }>(costs)
      .filter((r) => r.avg_ms !== null)
      .map((r) => [r.type, Number(r.avg_ms)]),
  )
  return { daysSinceRun, observedMs }
}
