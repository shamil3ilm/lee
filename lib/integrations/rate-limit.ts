import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { actionThrottle } from '@/lib/db/schema'

/**
 * SERVER-ONLY. Fixed-window per-user limits for actions that reach a
 * provider (connect, disconnect, test, post, refresh). Stored in Postgres so
 * the limit holds across serverless instances: one upsert per attempt.
 */

export interface RateRule {
  limit: number
  windowMs: number
}

export const RATE_RULES = {
  connect: { limit: 10, windowMs: 10 * 60_000 },
  disconnect: { limit: 10, windowMs: 10 * 60_000 },
  test: { limit: 20, windowMs: 10 * 60_000 },
  refresh_repos: { limit: 6, windowMs: 60 * 60_000 },
  linkedin_post: { limit: 10, windowMs: 24 * 60 * 60_000 },
  linkedin_draft: { limit: 30, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateRule>

export type RateAction =
  | 'github_connect'
  | 'github_disconnect'
  | 'github_test'
  | 'github_refresh_repos'
  | 'github_follow'
  | 'linkedin_connect'
  | 'linkedin_disconnect'
  | 'linkedin_post'
  | 'linkedin_draft'

export const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'

/** Count one attempt; false when the window's limit is already used up. */
export async function consumeRateLimit(userId: string, action: RateAction, rule: RateRule, now: Date = new Date()): Promise<boolean> {
  const windowFloor = new Date(now.getTime() - rule.windowMs).toISOString()
  const nowIso = now.toISOString()
  const [row] = await db
    .insert(actionThrottle)
    .values({ userId, action, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: [actionThrottle.userId, actionThrottle.action],
      set: {
        count: sql`case when ${actionThrottle.windowStart} <= ${windowFloor}::timestamptz then 1 else ${actionThrottle.count} + 1 end`,
        windowStart: sql`case when ${actionThrottle.windowStart} <= ${windowFloor}::timestamptz then ${nowIso}::timestamptz else ${actionThrottle.windowStart} end`,
      },
    })
    .returning()
  return (row?.count ?? 1) <= rule.limit
}

