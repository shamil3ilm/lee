import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'
import { DEFAULT_RETENTION_POLICY } from './windows'

/**
 * Derived results and cached blobs: CV score history, Model Lab runs, the
 * compiled-PDF cache and asset bytes that Drive already holds. Everything
 * here can be recomputed (or is a second copy); the user's documents and
 * their assets' only copy are never touched.
 */

export const CV_SCORE_RETENTION_DAYS = DEFAULT_RETENTION_POLICY.cvScoreDays
export const LAB_RUN_RETENTION_DAYS = DEFAULT_RETENTION_POLICY.labRunDays
// The PDF is recompiled on the next view, so a month-old cache entry is not
// worth its bytes on Neon.
export const PDF_CACHE_RETENTION_DAYS = 30

type Opts = BatchOpts & { days?: number }

/**
 * Delete CV score runs older than `days`, always keeping the newest run per
 * scored target (user, document, application, source kind + label), so
 * every CV and every CV-vs-job pair keeps its latest score.
 */
export async function pruneCvScores(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? CV_SCORE_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from cv_scores where id in (
        select id from (
          select id, created_at, row_number() over (
            partition by user_id, document_id, application_id, source_kind, source_label
            order by created_at desc, id desc
          ) as rn
          from cv_scores
          where true${userScope(sql`user_id`, opts.userId)}
        ) ranked
        where rn > 1 and created_at < ${before}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/**
 * Delete Model Lab runs older than `days` (results cascade). A run with a
 * blind vote is the user's judgement and is kept.
 */
export async function pruneLabRuns(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? LAB_RUN_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from lab_runs where id in (
        select r.id from lab_runs r
        where r.created_at < ${before}${userScope(sql`r.user_id`, opts.userId)}
          and not exists (
            select 1 from lab_run_results x where x.run_id = r.id and x.vote is not null
          )
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/**
 * Evict Postgres-held compiled-PDF cache entries older than `days`. Entries
 * whose bytes live in Drive cost Neon nothing and are left alone (deleting
 * the row would orphan the Drive file).
 */
export async function evictPdfCache(now: Date = new Date(), opts: Opts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, opts.days ?? PDF_CACHE_RETENTION_DAYS)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from document_pdf_cache where document_id in (
        select document_id from document_pdf_cache
        where bytes is not null and drive_file_id is null
          and created_at < ${before}${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

/**
 * Clear asset bytes that Drive already holds. Reads route by drive_file_id
 * (lib/storage/routing-asset-store.ts), so a row carrying both copies never
 * serves its bytea. The sha256 is filled from the bytes first, because the
 * PDF cache key needs it once the bytes are gone. Batches are small: each
 * row may hold megabytes.
 */
export async function dropDriveDuplicatedBytes(opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      update document_assets
      set bytes = null, sha256 = coalesce(sha256, encode(sha256(bytes), 'hex'))
      where id in (
        select id from document_assets
        where bytes is not null and drive_file_id is not null${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, { ...opts, batchSize: Math.min(opts.batchSize ?? 100, 100) })
}
