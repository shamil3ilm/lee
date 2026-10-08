import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, once, userScope, type BatchOpts } from './batch'

/**
 * AI Radar (docs/ai-radar.md). Fetched items are a cache of public data:
 * after RADAR_ITEM_DAYS an item is deleted unless it — or its entry —
 * matches a watch term, the entry is saved, or the entry has a brief.
 * Entries left without items are deleted too, unless saved or briefed.
 * Saved entries and briefs (with the items they rest on) are kept.
 */

export const RADAR_ITEM_DAYS = 30

export async function pruneRadarItems(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, RADAR_ITEM_DAYS).toISOString()
  const items = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from radar_items where id in (
        select i.id from radar_items i
        join radar_entries e on e.id = i.entry_id
        where i.fetched_at < ${before}::timestamptz
          and cardinality(i.matched_terms) = 0
          and cardinality(e.matched_terms) = 0
          and e.saved_at is null
          and not exists (select 1 from radar_briefs b where b.entry_id = e.id)
          ${userScope(sql`i.user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  if (items === 0) return 0
  const entries = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from radar_entries where id in (
        select e.id from radar_entries e
        where e.saved_at is null
          and not exists (select 1 from radar_items i where i.entry_id = e.id)
          and not exists (select 1 from radar_briefs b where b.entry_id = e.id)
          ${userScope(sql`e.user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  // Keep the counts shown in the feed true after pruning.
  await once(async () => {
    await client.execute(sql`
      update radar_entries e set item_count = c.n
      from (select entry_id, count(*)::int as n from radar_items group by entry_id) c
      where c.entry_id = e.id and e.item_count <> c.n ${userScope(sql`e.user_id`, opts.userId)}
    `)
    return 0
  }, opts.deadline)
  return items + entries
}
