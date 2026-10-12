import { and, eq, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { actionThrottle } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

/**
 * SERVER-ONLY. Per-user rate limits on expensive actions (invite-beta spec
 * §4.5). Reuses the `action_throttle` table of the integrations limiter
 * (lib/integrations/rate-limit.ts; pruned by retention): one row per
 * (user, action) whose window rolls in place. One statement per check: the
 * increment and the limit test are atomic, so two concurrent requests
 * cannot both take the last slot, and a refused attempt is not counted.
 */

export interface RateLimitRule {
  limit: number
  windowSec: number
  /** Shown to the user when the limit is hit. */
  label: string
}

export const RATE_LIMITS = {
  /** Add application / job from a URL (fetch + optional Firecrawl + AI parse). */
  addFromUrl: { limit: 30, windowSec: 3_600, label: 'adding jobs from a link' },
  /** Source create / update (each queues a poll). */
  sourceWrite: { limit: 20, windowSec: 86_400, label: 'adding or changing sources' },
  /** Settings › Sources bulk actions: turn on / off, check now, watch reminders (one use per click). */
  sourceBulk: { limit: 30, windowSec: 3_600, label: 'changing many sources at once' },
  /** "Run now" on background jobs. */
  runNow: { limit: 12, windowSec: 3_600, label: 'running jobs now' },
  /** AI document generation: tailored CV, cover letter, follow-up, outreach, prep pack. */
  aiGenerate: { limit: 60, windowSec: 3_600, label: 'AI generations' },
  /** LaTeX compiles on the shared compile service. */
  latexCompile: { limit: 30, windowSec: 3_600, label: 'PDF compiles' },
  /** Invite creation (owner). */
  invite: { limit: 20, windowSec: 86_400, label: 'invites' },
} as const satisfies Record<string, RateLimitRule>

export type RateBucket = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  allowed: boolean
  /** Uses left in this window after this one (0 when refused). */
  remaining: number
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number
}

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/** Stored action name: namespaced so it never collides with the integrations limiter. */
export function actionKey(bucket: string): string {
  return `beta:${bucket}`
}

/**
 * Count one use of `bucket` for `userId`; refused once `limit` uses
 * happened in the current window (which starts at the first use).
 */
export async function rateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowSec: number,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<RateLimitResult> {
  const action = actionKey(bucket)
  const nowIso = now.toISOString()
  const floor = new Date(now.getTime() - windowSec * 1000).toISOString()
  const result = await client.execute(sql`
    insert into action_throttle (user_id, action, window_start, count)
    values (${userId}::uuid, ${action}, ${nowIso}::timestamptz, 1)
    on conflict (user_id, action) do update set
      count = case when action_throttle.window_start <= ${floor}::timestamptz then 1 else action_throttle.count + 1 end,
      window_start = case when action_throttle.window_start <= ${floor}::timestamptz then ${nowIso}::timestamptz else action_throttle.window_start end
    where action_throttle.window_start <= ${floor}::timestamptz or action_throttle.count < ${limit}
    returning count
  `)
  const row = toRows<{ count: number | string }>(result)[0]
  if (row) return { allowed: true, remaining: Math.max(0, limit - Number(row.count)), retryAfterSec: 0 }
  const [held] = await client
    .select({ windowStart: actionThrottle.windowStart })
    .from(actionThrottle)
    .where(and(eq(actionThrottle.userId, userId), eq(actionThrottle.action, action)))
    .limit(1)
  const resetAt = (held?.windowStart.getTime() ?? now.getTime()) + windowSec * 1000
  return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)) }
}

/**
 * `rateLimit` with a named rule from RATE_LIMITS. Fails OPEN on a database
 * error (logged): a limiter must never take a feature down.
 */
export async function checkRate(userId: string, bucket: RateBucket, now: Date = new Date()): Promise<RateLimitResult> {
  const r = RATE_LIMITS[bucket]
  try {
    return await rateLimit(userId, bucket, r.limit, r.windowSec, now)
  } catch (err) {
    logger.warn('rate_limit_check_failed', { userId, bucket, err: err instanceof Error ? err.message : String(err) })
    return { allowed: true, remaining: 0, retryAfterSec: 0 }
  }
}

/** Friendly refusal for an action result. */
export function rateLimitMessage(bucket: RateBucket, r: RateLimitResult): string {
  const mins = Math.ceil(r.retryAfterSec / 60)
  const wait = mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} minute${mins === 1 ? '' : 's'}`
  return `You've reached the limit for ${RATE_LIMITS[bucket].label}. Try again in about ${wait}.`
}

/** The refusal message when `userId` is over the `bucket` limit, else null (counts one use). */
export async function rateLimited(userId: string, bucket: RateBucket, now: Date = new Date()): Promise<string | null> {
  const r = await checkRate(userId, bucket, now)
  return r.allowed ? null : rateLimitMessage(bucket, r)
}
