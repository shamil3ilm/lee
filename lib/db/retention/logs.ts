import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'
import { DEFAULT_RETENTION_POLICY } from './windows'

/** Append-only logs and run history: pruned by age, in batches. */

export const AI_CALL_LOG_RETENTION_DAYS = DEFAULT_RETENTION_POLICY.aiCallLogDays
// Gmail sync only searches `newer_than:30d`, so a dedup marker older than
// that can never match a thread again; 35 days leaves a safety margin.
export const GMAIL_THREAD_RETENTION_DAYS = 35
export const DONE_JOB_RETENTION_DAYS = 14
export const DEAD_JOB_RETENTION_DAYS = 30
export const WEB_VITALS_RETENTION_DAYS = DEFAULT_RETENTION_POLICY.webVitalsDays

type Opts = BatchOpts & { days?: number }

/**
 * Delete ai_call_logs rows older than `days`. Every FK into this table
 * (discoveries / company_discoveries.scored_by_call_id, cv_scores.ai_call_id)
 * is ON DELETE SET NULL and indexed (migration 0017), so the delete detaches
 * referencing rows without sequential scans.
 */
export async function pruneAiCallLogs(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? AI_CALL_LOG_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from ai_call_logs where id in (
        select id from ai_call_logs
        where created_at < ${before}${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/** Delete Gmail sync dedup markers older than `days`. */
export async function pruneProcessedGmailThreads(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? GMAIL_THREAD_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from processed_gmail_threads where (user_id, thread_id) in (
        select user_id, thread_id from processed_gmail_threads
        where processed_at < ${before}${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/**
 * Delete finished queue jobs: `done` after DONE_JOB_RETENTION_DAYS and
 * `dead` after DEAD_JOB_RETENTION_DAYS (by finished_at). Queued, running
 * and failed-awaiting-retry jobs are never touched. A deleted job's
 * idempotency key is from a past UTC day, so it can never be re-enqueued.
 */
export async function pruneQueueJobs(
  now: Date = new Date(),
  opts: BatchOpts & { doneDays?: number; deadDays?: number } = {},
): Promise<number> {
  const client = clientOf(opts)
  const doneBefore = cutoff(now, opts.doneDays ?? DONE_JOB_RETENTION_DAYS)
  const deadBefore = cutoff(now, opts.deadDays ?? DEAD_JOB_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from queue_jobs where id in (
        select id from queue_jobs
        where ((status = 'done' and finished_at < ${doneBefore})
           or (status = 'dead' and finished_at < ${deadBefore}))${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/**
 * Delete web vitals aggregates (one row per user/day/route/metric) whose UTC
 * day is more than `days` before `now`. Analytics › Performance shows at most
 * the last 28 days, so 90 days leaves room for longer comparisons.
 */
export async function pruneWebVitals(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? WEB_VITALS_RETENTION_DAYS).toISOString().slice(0, 10)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from web_vitals_daily where (user_id, day, route, metric) in (
        select user_id, day, route, metric from web_vitals_daily
        where day < ${before}::date${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}
