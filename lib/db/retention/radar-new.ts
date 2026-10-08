import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, type BatchOpts } from './batch'

/**
 * AI Radar "What's new" (docs/ai-radar.md): the shared rows are a cache of
 * public data. An entry first seen more than RADAR_NEW_DAYS ago is deleted
 * (its items with it) unless someone keeps it:
 *   - saved or briefed: a user's own Radar entry opened from it (key
 *     `new:<id>`) is saved or has a brief;
 *   - watched: a user watches a term equal to its name.
 * Global step (the rows have no user).
 */

export const RADAR_NEW_DAYS = 60

export async function pruneRadarWhatsNew(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, RADAR_NEW_DAYS).toISOString()
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from radar_new_entries where id in (
        select n.id from radar_new_entries n
        where n.first_seen_at < ${before}::timestamptz
          and not exists (
            select 1 from radar_entries e
            where e.keys @> array['new:' || n.id::text]
              and (e.saved_at is not null or exists (select 1 from radar_briefs b where b.entry_id = e.id))
          )
          and not exists (select 1 from radar_watch_terms t where lower(t.term) = lower(n.name))
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}
