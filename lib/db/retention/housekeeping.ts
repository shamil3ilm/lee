import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, once, userScope, type BatchOpts } from './batch'

/**
 * Orphans (rows whose parent is gone but no FK can cascade) and expired
 * bookkeeping rows nobody reads again.
 */

// Settings › Usage trends read this month plus 14 days; a year of daily
// snapshots is plenty of history.
export const USAGE_SNAPSHOT_RETENTION_DAYS = 365
// A usage alert only dedupes its own month's warning.
export const USAGE_ALERT_RETENTION_DAYS = 400
// Scam Shield re-checks domain age after 30 days and MX after 7, so a row
// untouched for 90 days would be refetched anyway.
export const SCAM_DOMAIN_CACHE_RETENTION_DAYS = 90

/**
 * Scam Shield rows whose target no longer exists. `target_id` is
 * polymorphic (discoveries.id | jobs.id), so no FK cascades: deleting a
 * source (its discoveries cascade) or a job via a company leaves them behind.
 */
export async function pruneOrphanRiskAssessments(opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from job_risk_assessments where id in (
        select r.id from job_risk_assessments r
        where (
          (r.target_type = 'discovery' and not exists (select 1 from discoveries d where d.id = r.target_id))
          or (r.target_type = 'job' and not exists (select 1 from jobs j where j.id = r.target_id))
        )${userScope(sql`r.user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/**
 * Cached Drive folder ids for documents that were deleted (keys
 * `doc:<id>` / `doc-assets:<id>`; a text key cannot carry an FK).
 */
export async function pruneOrphanDriveFolders(opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  return once(async () => {
    const res = await client.execute(sql`
      delete from drive_folders f
      where (f.folder_key like 'doc:%' or f.folder_key like 'doc-assets:%')${userScope(sql`f.user_id`, opts.userId)}
        and not exists (
          select 1 from documents d
          where d.id::text = substring(f.folder_key from position(':' in f.folder_key) + 1)
        )
    `)
    return affected(res)
  }, opts.deadline)
}

/**
 * Expired Auth.js rows. Sessions are JWTs today, so `sessions` is normally
 * empty, but magic-link tokens and any database session would otherwise
 * stay forever.
 */
export async function pruneExpiredAuthRows(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const sessions = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from sessions where "sessionToken" in (
        select "sessionToken" from sessions where expires < ${now} limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  const tokens = await once(async () => {
    const res = await client.execute(sql`delete from "verificationTokens" where expires < ${now}`)
    return affected(res)
  }, opts.deadline)
  return sessions + tokens
}

/** Old daily usage snapshots and past months' usage alerts. */
export async function pruneUsageHistory(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const snapshotDay = cutoff(now, USAGE_SNAPSHOT_RETENTION_DAYS).toISOString().slice(0, 10)
  const alertBefore = cutoff(now, USAGE_ALERT_RETENTION_DAYS)
  return once(async () => {
    const snaps = await client.execute(sql`delete from usage_snapshots where day < ${snapshotDay}`)
    const alerts = await client.execute(sql`delete from usage_alerts where created_at < ${alertBefore}`)
    return affected(snaps) + affected(alerts)
  }, opts.deadline)
}

/** Shared Scam Shield domain facts nobody has needed for a while. */
export async function pruneScamDomainCache(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, SCAM_DOMAIN_CACHE_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from scam_domain_cache where domain in (
        select domain from scam_domain_cache where updated_at < ${before} limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}
