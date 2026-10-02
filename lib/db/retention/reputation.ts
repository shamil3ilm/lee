import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'

/**
 * Company reputation cache (docs/company-reviews.md). Fetched signals are a
 * cache of public data: once a company is no longer watched and its
 * signals have not been refreshed for REPUTATION_CACHE_DAYS, they are
 * dropped. The user's own data — ratings, a confirmed summary (which cites
 * the signals) and the Google place id — is kept; a row left with nothing
 * of the user's is deleted.
 */

export const REPUTATION_CACHE_DAYS = 90

export async function pruneReputationCache(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, REPUTATION_CACHE_DAYS).toISOString()
  const stale = sql`
    r.fetched_at < ${before}::timestamptz
    and r.summary is null
    and not exists (select 1 from companies c where c.id = r.company_id and c.is_watched)
    ${userScope(sql`r.user_id`, opts.userId)}
  `
  const deleted = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from company_reputation where company_id in (
        select r.company_id from company_reputation r
        where ${stale}
          and r.user_ratings = '[]'::jsonb
          and r.places_place_id is null
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  const cleared = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      update company_reputation
      set signals = '[]'::jsonb, source_status = '{}'::jsonb, facts = null, fetched_at = null, updated_at = ${now.toISOString()}::timestamptz
      where company_id in (
        select r.company_id from company_reputation r
        where ${stale}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  return deleted + cleared
}
