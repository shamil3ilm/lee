import { JOB_TYPES } from './job-types'

/**
 * Daily queue capacity on Vercel Hobby (pure, no I/O).
 *
 * Hobby runs each cron once a day, so the day's background work has a fixed
 * budget: the scheduler cron and the three drain crons (vercel.json) each
 * drain for CRON_DRAIN_BUDGET_MS with CRON_DRAIN_CONCURRENCY lanes. Page-visit
 * drains add more for people who are using lee, but nothing is promised on
 * them. With ~100 invitees × ~16 sources the naive plan (every source of
 * every user, every day) needs 4–16× that budget, so the scheduler plans
 * within it instead:
 *
 *  1. Skip dormant users (no visit for DORMANT_AFTER_DAYS); their next visit
 *     re-plans the day for them (lib/queue/visit.ts).
 *  2. Fixed per-user jobs (follow-ups, shortlist, Scam Shield re-check…) are
 *     costed first; the rest of the pool is shared by weighted fair share:
 *     active users ×3, idle users ×1.
 *  3. Each user's share buys source polls, most urgent first: the
 *     longest-unpolled, with sources that found postings in the user's
 *     STARRED regions counted STARRED_BONUS_DAYS older (polled more often,
 *     never starving the rest). Every planned user gets at least one poll.
 *  4. A fixed share of the pool (WEEKLY_RESERVE_SHARE) runs the weekly
 *     company chain (company discovery → employer-board auto-detect →
 *     growth) for the most overdue users; enrichment batches use leftovers.
 *  5. The drains claim round-robin across users and time-slice each drain
 *     (lib/queue/queue.ts claim, lib/queue/drain.ts), so a user with many
 *     jobs never starves the rest.
 *
 * tests/unit/queue-capacity.test.ts simulates 100 users through a day.
 */

/** Cron drains a day: /api/cron/schedule (09:00) + /api/cron/drain at 12:00, 16:00, 21:00. */
export const DAILY_CRON_DRAINS = 4
/** Budget of one cron drain (keep in sync with lib/queue/cron.ts). */
export const DRAIN_BUDGET_MS = 240_000
/** Lanes per cron drain (keep in sync with lib/queue/cron.ts). */
export const DRAIN_LANES = 3
/**
 * Share of the raw lane time the plan may fill: lanes idle at the end of a
 * drain (a 20 s poll is not started with 15 s left), stop margins, claims
 * and retries eat the rest.
 */
export const PLANNING_UTILISATION = 0.75

/** No visit for this long → dormant: no scheduled jobs until the next visit. */
export const DORMANT_AFTER_DAYS = 14
/** A visit within this many days → active (larger share). */
export const ACTIVE_WITHIN_DAYS = 3

export type ActivityTier = 'active' | 'idle' | 'dormant'
export const TIER_WEIGHT: Readonly<Record<ActivityTier, number>> = { active: 3, idle: 1, dormant: 0 }
/** Added to a discovery poll's priority: active users' polls are claimed first. */
export const TIER_PRIORITY_OFFSET: Readonly<Record<ActivityTier, number>> = { active: 0, idle: 1, dormant: 2 }

const DAY_MS = 86_400_000

/** Expected cost of one job by type when there is no history yet (ms). */
export const DEFAULT_JOB_COST_MS: Readonly<Record<string, number>> = {
  [JOB_TYPES.discoverySource]: 10_000,
  [JOB_TYPES.followups]: 500,
  [JOB_TYPES.gmailSync]: 6_000,
  [JOB_TYPES.digest]: 1_500,
  [JOB_TYPES.scamReassess]: 1_500,
  [JOB_TYPES.shortlist]: 1_500,
  [JOB_TYPES.discoveryEmail]: 1_500,
  [JOB_TYPES.radarSource]: 4_000,
  [JOB_TYPES.portfolioPull]: 1_500,
  [JOB_TYPES.discoveryBenefits]: 800,
  // The weekly company chain (lib/company-discovery): discovery, then the
  // employer-board auto-detect and the growth refresh it enqueues. Costed
  // near their time budgets until queue history says otherwise.
  [JOB_TYPES.companyDiscovery]: 120_000,
  [JOB_TYPES.companyBoards]: 110_000,
  [JOB_TYPES.companyGrowth]: 110_000,
  [JOB_TYPES.companyEnrich]: 60_000,
}

/** Job types of the weekly company chain the plan budgets as one unit. */
export const WEEKLY_CHAIN_TYPES = [JOB_TYPES.companyDiscovery, JOB_TYPES.companyBoards, JOB_TYPES.companyGrowth] as const

/**
 * Share of the day's plan pool reserved for weekly company chains. The rest
 * is daily work (polls and the per-user steps). Enrichment batches are not
 * planned: they run at the lowest priority in whatever lane time is left.
 */
export const WEEKLY_RESERVE_SHARE = 0.2

/** Cost of one user's weekly chain: observed averages per type, else the defaults. */
export function weeklyChainCostMs(observed: ReadonlyMap<string, number> = new Map()): number {
  return WEEKLY_CHAIN_TYPES.reduce((s, t) => s + (observed.get(t) ?? DEFAULT_JOB_COST_MS[t]!), 0)
}

export interface WeeklyCandidate {
  userId: string
  tier: ActivityTier
  /** Days since the user's last weekly company run (null = none on record). */
  daysSinceRun: number | null
}

/** No record (never run, or history pruned after 14 days) counts as this old. */
export const WEEKLY_NEVER_DAYS = 30

/**
 * Users whose weekly company chain runs today, within `reserveMs`: only
 * non-dormant users at least 7 days since their last run, most overdue first
 * (active users' days count ×2), ties by id. At 100 users the chain cycles
 * every few weeks rather than weekly — the honest cost of ~340 s per run on
 * a 2,880 lane-second day.
 */
export function pickWeeklyUsers(candidates: readonly WeeklyCandidate[], reserveMs: number, chainCostMs: number): string[] {
  const due = candidates
    .filter((c) => c.tier !== 'dormant' && (c.daysSinceRun === null || c.daysSinceRun >= 7))
    .map((c) => ({ ...c, urgency: (c.daysSinceRun ?? WEEKLY_NEVER_DAYS) * (c.tier === 'active' ? 2 : 1) }))
    .sort((a, b) => b.urgency - a.urgency || a.userId.localeCompare(b.userId))
  const n = Math.max(0, Math.floor(reserveMs / Math.max(1, chainCostMs)))
  return due.slice(0, n).map((c) => c.userId)
}

/** A poll's cost estimate is clamped to this range (one slow source cannot eat a budget). */
export const SOURCE_COST_MIN_MS = 2_000
export const SOURCE_COST_MAX_MS = 60_000

export function dailyLaneMs(drains = DAILY_CRON_DRAINS, budgetMs = DRAIN_BUDGET_MS, lanes = DRAIN_LANES): number {
  return drains * budgetMs * lanes
}

/** The lane time the day's plan may fill (daily work + the weekly reserve). */
export function dailyPlanPoolMs(): number {
  return Math.floor(dailyLaneMs() * PLANNING_UTILISATION)
}

/** The part of the pool for weekly company chains. */
export function weeklyReserveMs(): number {
  return Math.floor(dailyPlanPoolMs() * WEEKLY_RESERVE_SHARE)
}

/** The part of the pool for daily work (polls and per-user steps). */
export function dailyWorkPoolMs(): number {
  return dailyPlanPoolMs() - weeklyReserveMs()
}

/**
 * An active user's share of the daily work pool when every planned user's
 * tier weights add up to `totalWeight` (the plan "Run now" and a returning
 * visitor get: lib/queue/scheduler.ts scheduleUserToday).
 */
export function activeShareMs(totalWeight: number, poolMs: number = dailyWorkPoolMs()): number {
  return (poolMs * TIER_WEIGHT.active) / Math.max(TIER_WEIGHT.active, totalWeight)
}

/** Of that share, the lane time left for source polls after the user's fixed daily jobs. */
export function userPollBudgetMs(totalWeight: number, fixedMs: number, poolMs: number = dailyWorkPoolMs()): number {
  return Math.max(0, Math.floor(activeShareMs(totalWeight, poolMs) - fixedMs))
}

export function activityTier(lastSeenAt: Date | null, createdAt: Date, now: Date): ActivityTier {
  const seen = lastSeenAt ?? createdAt
  const age = now.getTime() - seen.getTime()
  if (age <= ACTIVE_WITHIN_DAYS * DAY_MS) return 'active'
  if (age <= DORMANT_AFTER_DAYS * DAY_MS) return 'idle'
  return 'dormant'
}

export interface PlanSource {
  id: string
  /** Postings this source found in the user's starred regions (last 30 days). */
  starredYield: number
  lastPolledAt: Date | null
  /** Expected poll duration (observed average, or the default). */
  costMs: number
}

export interface PlanUser {
  userId: string
  tier: ActivityTier
  sources: readonly PlanSource[]
  /** Expected cost of the user's other daily jobs (follow-ups, shortlist…). */
  fixedCostMs: number
}

export interface UserPlan {
  tier: ActivityTier
  /** Lane time granted for source polls (ms). */
  budgetMs: number
  /** Sources to poll today, in claim order (best first). */
  sourceIds: string[]
  /** Expected lane time of the picked polls (ms). */
  plannedMs: number
}

export function sourceCost(observedAvgMs: number | null | undefined): number {
  const v = observedAvgMs && Number.isFinite(observedAvgMs) ? observedAvgMs : DEFAULT_JOB_COST_MS[JOB_TYPES.discoverySource]!
  return Math.min(SOURCE_COST_MAX_MS, Math.max(SOURCE_COST_MIN_MS, Math.round(v)))
}

/**
 * A starred-region source counts as this many days "older" than it is, so
 * it is polled about that much more often without starving the others.
 */
export const STARRED_BONUS_DAYS = 3
/** A never-polled source counts as this many days old (polled soon). */
export const NEVER_POLLED_DAYS = 30

/** Days since the last poll plus the starred bonus: the higher, the sooner. */
export function sourceUrgency(s: PlanSource, now: Date): number {
  const age = s.lastPolledAt ? Math.max(0, (now.getTime() - s.lastPolledAt.getTime()) / DAY_MS) : NEVER_POLLED_DAYS
  return age + (s.starredYield > 0 ? STARRED_BONUS_DAYS : 0)
}

/**
 * Never-polled sources first (a source just added is searched at the next
 * drain), then most urgent (staleness + starred bonus), then the higher
 * starred yield, then id. Every source rotates in; starred ones come round
 * sooner. The drain's claim order (lib/queue/queue.ts claim) agrees: within
 * the poll priority it takes never-polled sources, then the stalest
 * last_polled_at — the starred bonus decides which sources get today's
 * slots here, not the order they run in.
 */
export function rankSources(sources: readonly PlanSource[], now: Date = new Date()): PlanSource[] {
  return [...sources].sort((a, b) => {
    const never = Number(b.lastPolledAt === null) - Number(a.lastPolledAt === null)
    if (never !== 0) return never
    const u = sourceUrgency(b, now) - sourceUrgency(a, now)
    if (Math.abs(u) > 1e-9) return u
    if (a.starredYield !== b.starredYield) return b.starredYield - a.starredYield
    return a.id.localeCompare(b.id)
  })
}

/**
 * Polls that fit `budgetMs`, best first. At least one source when the user
 * has any: everyone gets a daily discovery. A source that does not fit is
 * skipped, and a cheaper one after it may still fit.
 */
export function pickSources(sources: readonly PlanSource[], budgetMs: number, now: Date = new Date()): { ids: string[]; plannedMs: number } {
  const ranked = rankSources(sources, now)
  const ids: string[] = []
  let used = 0
  for (const s of ranked) {
    if (ids.length > 0 && used + s.costMs > budgetMs) continue
    ids.push(s.id)
    used += s.costMs
  }
  return { ids, plannedMs: used }
}

/**
 * Weighted fair share of the day's pool. Fixed per-user jobs come off the
 * top; the rest is split by tier weight. A user who needs less than their
 * share returns the surplus to the others (water-filling), so a light user
 * never strands capacity a heavy user could use.
 */
export function planCapacity(users: readonly PlanUser[], poolMs: number = dailyWorkPoolMs(), now: Date = new Date()): Map<string, UserPlan> {
  const planned = users.filter((u) => TIER_WEIGHT[u.tier] > 0)
  const fixed = planned.reduce((s, u) => s + u.fixedCostMs, 0)
  let remaining = Math.max(0, poolMs - fixed)
  const demand = new Map(planned.map((u) => [u.userId, u.sources.reduce((s, x) => s + x.costMs, 0)]))
  const budget = new Map(planned.map((u) => [u.userId, 0]))
  let open = planned.filter((u) => (demand.get(u.userId) ?? 0) > 0)
  // Water-filling: give each open user their weighted share, capped at their demand; repeat with the surplus.
  for (let round = 0; round < 8 && open.length > 0 && remaining > 0; round++) {
    const weights = open.reduce((s, u) => s + TIER_WEIGHT[u.tier], 0)
    let handed = 0
    for (const u of open) {
      const share = (remaining * TIER_WEIGHT[u.tier]) / weights
      const need = (demand.get(u.userId) ?? 0) - (budget.get(u.userId) ?? 0)
      const give = Math.min(share, need)
      budget.set(u.userId, (budget.get(u.userId) ?? 0) + give)
      handed += give
    }
    remaining -= handed
    open = open.filter((u) => (budget.get(u.userId) ?? 0) < (demand.get(u.userId) ?? 0) - 1)
    if (handed < 1) break
  }
  const out = new Map<string, UserPlan>()
  for (const u of users) {
    if (TIER_WEIGHT[u.tier] === 0) {
      out.set(u.userId, { tier: u.tier, budgetMs: 0, sourceIds: [], plannedMs: 0 })
      continue
    }
    const b = Math.floor(budget.get(u.userId) ?? 0)
    const { ids, plannedMs } = pickSources(u.sources, b, now)
    out.set(u.userId, { tier: u.tier, budgetMs: b, sourceIds: ids, plannedMs })
  }
  return out
}

/** Per-user time slice of one drain: lane time split across users with due work. */
export const MIN_DRAIN_SLICE_MS = 15_000

export function drainSliceMs(budgetMs: number, lanes: number, usersWithWork: number): number {
  if (usersWithWork <= 0) return Number.POSITIVE_INFINITY
  return Math.max(MIN_DRAIN_SLICE_MS, Math.floor((budgetMs * lanes) / usersWithWork))
}
