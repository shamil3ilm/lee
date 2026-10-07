import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'

/**
 * Apply-faster history (lib/apply): daily shortlist snapshots older than
 * SHORTLIST_SNAPSHOT_DAYS (the page shows today's, the funnel this week's)
 * and "Not for me" feedback older than FEEDBACK_DAYS (the ranking only
 * reads the last 180 days). application_preps rows live and die with their
 * application. Idempotent.
 */

export const SHORTLIST_SNAPSHOT_DAYS = 30
export const FEEDBACK_DAYS = 180

export async function pruneApplyHistory(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const snapshotDay = cutoff(now, SHORTLIST_SNAPSHOT_DAYS).toISOString().slice(0, 10)
  const feedbackBefore = cutoff(now, FEEDBACK_DAYS)
  const entries = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from shortlist_entries where id in (
        select id from shortlist_entries
        where day < ${snapshotDay}${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  const feedback = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from discovery_feedback where id in (
        select id from discovery_feedback
        where created_at < ${feedbackBefore}${userScope(sql`user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  return entries + feedback
}
