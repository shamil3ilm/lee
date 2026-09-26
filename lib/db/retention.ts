import { sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'

/**
 * Storage retention for Neon Free (0.5 GB). Every function is idempotent,
 * cross-user (run from the daily `/api/cron/retention` job) and returns the
 * number of rows it changed. Deletes run in bounded batches so one run never
 * holds a long lock or blows the function's CPU budget.
 */

export const DISMISSED_DISCOVERY_RETENTION_DAYS = 90
export const AI_CALL_LOG_RETENTION_DAYS = 180
// Gmail sync only searches `newer_than:30d`, so a dedup marker older than
// that can never match a thread again; 35 days leaves a safety margin.
export const GMAIL_THREAD_RETENTION_DAYS = 35
// Discovery scoring runs synchronously right after insert, so a row older
// than a day has been scored (or scoring failed and will use `normalized`).
export const DISCOVERY_COMPACT_AFTER_HOURS = 24
export const RETENTION_BATCH_SIZE = 5_000
// Upper bound on batches per step per run (≈ 250k rows) — a safety valve,
// not an expected limit.
const MAX_BATCHES = 50

const DAY_MS = 24 * 60 * 60 * 1000

export interface BatchOpts {
  batchSize?: number
  client?: DbClient
}

function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

function affected(result: unknown): number {
  // postgres-js returns an array with `count`; PGlite returns { affectedRows }.
  const r = result as { count?: number; affectedRows?: number; rowCount?: number }
  return Number(r.count ?? r.affectedRows ?? r.rowCount ?? 0)
}

async function inBatches(
  run: (limit: number) => Promise<number>,
  batchSize: number,
): Promise<number> {
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const n = await run(batchSize)
    total += n
    if (n < batchSize) break
  }
  return total
}

/**
 * Tombstone job + company discoveries the user dismissed more than `days`
 * ago. The rows are KEPT — their (source_id, source_job_id /
 * source_company_id) unique key is what dedupes re-ingestion, so a posting
 * the source still lists can never re-enter the inbox — but the heavy
 * payload is dropped: `raw` becomes `{}`, `normalized` is cut down to
 * kind/title/company name, and `match_reasoning` is nulled. Status and
 * dates (including updated_at) are left untouched. Their Scam Shield rows
 * are deleted (job_risk_assessments has no FK to discoveries — `target_id`
 * is polymorphic — so that delete is explicit).
 *
 * Returns the number of discovery rows tombstoned by this run (already
 * tombstoned rows are skipped, so the job is idempotent).
 */
export async function tombstoneDismissedDiscoveries(
  now: Date = new Date(),
  opts: BatchOpts & { days?: number } = {},
): Promise<number> {
  const client = opts.client ?? db
  const before = cutoff(now, opts.days ?? DISMISSED_DISCOVERY_RETENTION_DAYS)
  const batch = opts.batchSize ?? RETENTION_BATCH_SIZE
  await client.execute(sql`
    delete from job_risk_assessments r
    using discoveries d
    where r.target_type = 'discovery' and r.target_id = d.id
      and d.status = 'dismissed' and d.updated_at < ${before}
  `)
  const jobs = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      with slim as (
        select id, jsonb_strip_nulls(jsonb_build_object(
          'kind', normalized->'kind',
          'title', normalized->'title',
          'companyName', normalized->'companyName'
        )) as normalized
        from discoveries
        where status = 'dismissed' and updated_at < ${before}
      ),
      todo as (
        select s.id, s.normalized from slim s join discoveries d on d.id = s.id
        where d.raw <> '{}'::jsonb or d.normalized <> s.normalized or d.match_reasoning is not null
        limit ${limit}
      )
      update discoveries d
      set raw = '{}'::jsonb, normalized = todo.normalized, match_reasoning = null
      from todo where d.id = todo.id
    `)
    return affected(res)
  }, batch)
  const companies = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      with slim as (
        select id, jsonb_strip_nulls(jsonb_build_object(
          'kind', normalized->'kind',
          'name', normalized->'name'
        )) as normalized
        from company_discoveries
        where status = 'dismissed' and updated_at < ${before}
      ),
      todo as (
        select s.id, s.normalized from slim s join company_discoveries d on d.id = s.id
        where d.raw <> '{}'::jsonb or d.normalized <> s.normalized or d.match_reasoning is not null
        limit ${limit}
      )
      update company_discoveries d
      set raw = '{}'::jsonb, normalized = todo.normalized, match_reasoning = null
      from todo where d.id = todo.id
    `)
    return affected(res)
  }, batch)
  return jobs + companies
}

/**
 * Delete ai_call_logs rows older than `days`. Every FK into this table
 * (discoveries / company_discoveries.scored_by_call_id, cv_scores.ai_call_id)
 * is ON DELETE SET NULL and indexed (migration 0017), so the delete detaches
 * referencing rows without sequential scans.
 */
export async function pruneAiCallLogs(
  now: Date = new Date(),
  opts: BatchOpts & { days?: number } = {},
): Promise<number> {
  const client = opts.client ?? db
  const before = cutoff(now, opts.days ?? AI_CALL_LOG_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from ai_call_logs where id in (
        select id from ai_call_logs where created_at < ${before} limit ${limit}
      )
    `)
    return affected(res)
  }, opts.batchSize ?? RETENTION_BATCH_SIZE)
}

/** Delete Gmail sync dedup markers older than `days`. */
export async function pruneProcessedGmailThreads(
  now: Date = new Date(),
  opts: BatchOpts & { days?: number } = {},
): Promise<number> {
  const client = opts.client ?? db
  const before = cutoff(now, opts.days ?? GMAIL_THREAD_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from processed_gmail_threads where (user_id, thread_id) in (
        select user_id, thread_id from processed_gmail_threads
        where processed_at < ${before} limit ${limit}
      )
    `)
    return affected(res)
  }, opts.batchSize ?? RETENTION_BATCH_SIZE)
}

/**
 * Drop the verbatim source payload from discoveries once they have been
 * scored. Nothing reads `discoveries.raw` / `company_discoveries.raw` or the
 * duplicate `normalized.raw` copy after ingestion (render, scoring, promote,
 * digest and Scam Shield all use the typed `normalized` fields), yet they
 * are the largest part of each row. The insert path is left unchanged; this
 * compacts rows older than DISCOVERY_COMPACT_AFTER_HOURS.
 */
export async function compactDiscoveryPayloads(
  now: Date = new Date(),
  opts: BatchOpts = {},
): Promise<number> {
  const client = opts.client ?? db
  const before = new Date(now.getTime() - DISCOVERY_COMPACT_AFTER_HOURS * 60 * 60 * 1000)
  const batch = opts.batchSize ?? RETENTION_BATCH_SIZE
  const jobs = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      update discoveries set raw = '{}'::jsonb, normalized = normalized - 'raw'
      where id in (
        select id from discoveries
        where created_at < ${before}
          and (raw <> '{}'::jsonb or normalized ? 'raw')
        limit ${limit}
      )
    `)
    return affected(res)
  }, batch)
  const companies = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      update company_discoveries set raw = '{}'::jsonb, normalized = normalized - 'raw'
      where id in (
        select id from company_discoveries
        where created_at < ${before}
          and (raw <> '{}'::jsonb or normalized ? 'raw')
        limit ${limit}
      )
    `)
    return affected(res)
  }, batch)
  return jobs + companies
}

export const DONE_JOB_RETENTION_DAYS = 14
export const DEAD_JOB_RETENTION_DAYS = 30

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
  const client = opts.client ?? db
  const doneBefore = cutoff(now, opts.doneDays ?? DONE_JOB_RETENTION_DAYS)
  const deadBefore = cutoff(now, opts.deadDays ?? DEAD_JOB_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from queue_jobs where id in (
        select id from queue_jobs
        where (status = 'done' and finished_at < ${doneBefore})
           or (status = 'dead' and finished_at < ${deadBefore})
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts.batchSize ?? RETENTION_BATCH_SIZE)
}

export const WEB_VITALS_RETENTION_DAYS = 90

/**
 * Delete web vitals aggregates (one row per user/day/route/metric) whose UTC
 * day is more than `days` before `now`. Analytics › Performance shows at most
 * the last 28 days, so 90 days leaves room for longer comparisons.
 */
export async function pruneWebVitals(
  now: Date = new Date(),
  opts: BatchOpts & { days?: number } = {},
): Promise<number> {
  const client = opts.client ?? db
  const before = cutoff(now, opts.days ?? WEB_VITALS_RETENTION_DAYS).toISOString().slice(0, 10)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from web_vitals_daily where (user_id, day, route, metric) in (
        select user_id, day, route, metric from web_vitals_daily
        where day < ${before}::date limit ${limit}
      )
    `)
    return affected(res)
  }, opts.batchSize ?? RETENTION_BATCH_SIZE)
}

export interface RetentionResult {
  tombstonedDiscoveries: number
  aiCallLogs: number
  gmailThreads: number
  compactedDiscoveries: number
  queueJobs: number
  webVitals: number
}

/** Run every retention step in sequence (each step is independent). */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult> {
  const tombstonedDiscoveries = await tombstoneDismissedDiscoveries(now)
  const aiCallLogs = await pruneAiCallLogs(now)
  const gmailThreads = await pruneProcessedGmailThreads(now)
  const compactedDiscoveries = await compactDiscoveryPayloads(now)
  const queueJobs = await pruneQueueJobs(now)
  const webVitals = await pruneWebVitals(now)
  return { tombstonedDiscoveries, aiCallLogs, gmailThreads, compactedDiscoveries, queueJobs, webVitals }
}
