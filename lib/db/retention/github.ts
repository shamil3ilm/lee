import { sql } from 'drizzle-orm'
import { affected, clientOf, cutoff, inBatches, userScope, type BatchOpts } from './batch'

/**
 * Connect GitHub / LinkedIn housekeeping.
 *
 * - github_repo_stats is a cache of counts: rows the user did not link to a
 *   project or follow, and that were not refreshed for
 *   GITHUB_STATS_RETENTION_DAYS, are deleted (a refresh re-creates them).
 * - oauth_states are single-use ten-minute rows: abandoned ones are deleted
 *   a day after they expired; action_throttle windows older than two days
 *   too (every window is at most a day long).
 */

export const GITHUB_STATS_RETENTION_DAYS = 30

export async function pruneGitHubRepoStats(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const before = cutoff(now, GITHUB_STATS_RETENTION_DAYS).toISOString()
  return inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from github_repo_stats where id in (
        select s.id from github_repo_stats s
        where s.fetched_at < ${before}::timestamptz
          and s.linked_project_id is null
          and not s.follow_deps
          ${userScope(sql`s.user_id`, opts.userId)}
        limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
}

export async function pruneIntegrationScratch(now: Date = new Date(), opts: BatchOpts = {}): Promise<number> {
  const client = clientOf(opts)
  const states = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from oauth_states where state_hash in (
        select state_hash from oauth_states where expires_at < ${cutoff(now, 1).toISOString()}::timestamptz limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  const throttles = await inBatches(async (limit) => {
    const res = await client.execute(sql`
      delete from action_throttle where (user_id, action) in (
        select user_id, action from action_throttle where window_start < ${cutoff(now, 2).toISOString()}::timestamptz limit ${limit}
      )
    `)
    return affected(res)
  }, opts)
  return states + throttles
}
