import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { reachFor, sourceReach } from '@/lib/coverage/source-reach'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { normalizePreferred } from '@/lib/regions/preferred'
import { TIER_WEIGHT, activityTier, sourceCost, userPollBudgetMs } from '@/lib/queue/capacity'
import { observedCosts, starredYields } from '@/lib/queue/plan-data'
import { fixedCostMs } from '@/lib/queue/scheduler'
import { sourceBlocker } from './readiness'
import { sourceGroupOf, type SourceGroup } from './selection'
import { loadSourceSetup } from './setup'

/**
 * SERVER-ONLY. What the bulk selection on Settings › Sources needs per
 * source — its "By type" group, whether it serves a starred region, why it
 * can't be polled, its expected poll cost — and the user's daily poll budget
 * for the "checked about every K days" note.
 */

export interface BulkSourceFacts {
  group: SourceGroup
  starred: boolean
  blocker: string | null
  costMs: number
}

export interface BulkPageData {
  facts: Map<string, BulkSourceFacts>
  /** Lane time a day the plan gives this user's source polls (ms). */
  pollBudgetMs: number
}

interface SourceLike {
  id: string
  kind: string
  config: unknown
}

type ProfileLike = Parameters<typeof searchPrefsFromProfile>[0]

function configOf(config: unknown): Record<string, unknown> {
  return config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {}
}

/** The user's poll budget as "Run now" plans it: an active user's share of today's pool, less their fixed jobs. */
async function pollBudgetMs(userId: string, fixedMs: number, now: Date): Promise<number> {
  const people = await db
    .select({ id: users.id, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(eq(users.status, 'active'))
  const weights = people.reduce((s, p) => s + TIER_WEIGHT[p.id === userId ? 'active' : activityTier(p.lastSeenAt, p.createdAt, now)], 0)
  return userPollBudgetMs(weights, fixedMs)
}

export async function loadBulkPageData(
  userId: string,
  polled: readonly SourceLike[],
  profile: ProfileLike,
  now: Date = new Date(),
): Promise<BulkPageData> {
  const stars = normalizePreferred(searchPrefsFromProfile(profile).extra.preferredRegions ?? []).map((r) => r.id)
  const ids = polled.map((s) => s.id)
  const setup = await loadSourceSetup(userId)
  const [costs, yields, budget] = await Promise.all([
    observedCosts(ids, now, userId),
    stars.length > 0 ? starredYields(new Map([[userId, stars]]), now) : Promise.resolve(new Map<string, number>()),
    pollBudgetMs(userId, fixedCostMs(setup.gmail, 0, false), now),
  ])
  const facts = new Map<string, BulkSourceFacts>()
  for (const s of polled) {
    const reach = sourceReach(s.kind, configOf(s.config))
    const inStarred = stars.some((id) => reachFor(reach, [id]) === 'region') || (yields.get(s.id) ?? 0) > 0
    facts.set(s.id, {
      group: sourceGroupOf(s.kind),
      starred: inStarred,
      blocker: sourceBlocker(s.kind, s.config, setup),
      costMs: sourceCost(costs.get(s.id)),
    })
  }
  return { facts, pollBudgetMs: budget }
}
