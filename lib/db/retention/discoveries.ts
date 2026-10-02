import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'
import { DEFAULT_RETENTION_POLICY } from './windows'

/**
 * Discovery clutter. Rows are never deleted here: their (source_id,
 * source_job_id / source_company_id) unique key is what dedupes
 * re-ingestion, so a posting the source still lists can never re-enter the
 * inbox. Instead the heavy jsonb payloads are dropped.
 */

export const DISMISSED_DISCOVERY_RETENTION_DAYS = DEFAULT_RETENTION_POLICY.dismissedDiscoveryDays
export const STALE_DISCOVERY_DAYS = DEFAULT_RETENTION_POLICY.staleDiscoveryDays
// Discovery scoring runs synchronously right after insert, so a row older
// than a day has been scored (or scoring failed and will use `normalized`).
export const DISCOVERY_COMPACT_AFTER_HOURS = 24

type Opts = BatchOpts & { days?: number }

/**
 * Auto-dismiss discoveries still unreviewed (`new`, or `filtered` by the
 * relevance gate) more than `days` after
 * they were ingested. The user never looked at them, so nothing they acted
 * on changes: shortlisted and saved rows are untouched. `updated_at` becomes
 * `now`, so the row sits in the Dismissed tab (restorable, full payload) for
 * the dismissed window before it is tombstoned. No feedback signal is sent.
 */
export async function expireStaleDiscoveries(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? STALE_DISCOVERY_DAYS)
  let total = 0
  for (const table of [sql`discoveries`, sql`company_discoveries`]) {
    total += await inBatches(async (limit) => {
      const res = await client.execute(sql`
        update ${table} set status = 'dismissed', updated_at = ${now}
        where id in (
          select id from ${table}
          where status in ('new', 'filtered') and created_at < ${before}${userScope(sql`user_id`, opts.userId)}
          limit ${limit}
        )
      `)
      return affected(res)
    }, opts)
  }
  return total
}

/**
 * Tombstone job + company discoveries the user dismissed more than `days`
 * ago: `raw` becomes `{}`, `normalized` is cut down to kind/title/company
 * name, and `match_reasoning` is nulled. Status and dates (including
 * updated_at) are left untouched. Their Scam Shield rows are deleted
 * (job_risk_assessments has no FK to discoveries — `target_id` is
 * polymorphic — so that delete is explicit).
 *
 * Returns the number of discovery rows tombstoned by this run (already
 * tombstoned rows are skipped, so the job is idempotent).
 */
export async function tombstoneDismissedDiscoveries(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? DISMISSED_DISCOVERY_RETENTION_DAYS)
  await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from job_risk_assessments where id in (
        select r.id from job_risk_assessments r
        join discoveries d on r.target_type = 'discovery' and r.target_id = d.id
        where d.status = 'dismissed' and d.updated_at < ${before}${userScope(sql`d.user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  const jobs = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      with slim as (
        select id, jsonb_strip_nulls(jsonb_build_object(
          'kind', normalized->'kind',
          'title', normalized->'title',
          'companyName', normalized->'companyName'
        )) as normalized
        from discoveries
        where status = 'dismissed' and updated_at < ${before}${userScope(sql`user_id`, opts.userId)}
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
  }, opts)
  const companies = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      with slim as (
        select id, jsonb_strip_nulls(jsonb_build_object(
          'kind', normalized->'kind',
          'name', normalized->'name'
        )) as normalized
        from company_discoveries
        where status = 'dismissed' and updated_at < ${before}${userScope(sql`user_id`, opts.userId)}
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
  }, opts)
  return jobs + companies
}

/**
 * Drop the verbatim source payload from discoveries once they have been
 * scored. Nothing reads `discoveries.raw` / `company_discoveries.raw` or the
 * duplicate `normalized.raw` copy after ingestion (render, scoring, promote,
 * digest and Scam Shield all use the typed `normalized` fields), yet they
 * are the largest part of each row. The insert path is left unchanged; this
 * compacts rows older than DISCOVERY_COMPACT_AFTER_HOURS.
 */
export async function compactDiscoveryPayloads(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = new Date(now.getTime() - DISCOVERY_COMPACT_AFTER_HOURS * 60 * 60 * 1000)
  let total = 0
  for (const table of [sql`discoveries`, sql`company_discoveries`]) {
    total += await inBatches(async (limit) => {
      const res = await client.execute(sql`
        update ${table} set raw = '{}'::jsonb, normalized = normalized - 'raw'
        where id in (
          select id from ${table}
          where created_at < ${before}
            and (raw <> '{}'::jsonb or normalized ? 'raw')${userScope(sql`user_id`, opts.userId)}
          limit ${limit}
        )
      `)
      return affected(res)
    }, opts)
  }
  return total
}
