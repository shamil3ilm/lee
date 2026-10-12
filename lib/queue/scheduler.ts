import { isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userProfile } from '@/lib/db/schema'
import { JOB_PRIORITY, JOB_TYPES, jobKeys, utcDay } from './job-types'
import { enqueueMany, type EnqueueSpec } from './queue'
import { applyDefaults } from '@/lib/defaults/apply'
import { radarSourcesByUser } from '@/lib/radar/schedule'
import type { RadarSource } from '@/lib/radar/types'
import { weeklyCompanySpec } from '@/lib/company-discovery/schedule'
import { listPullUsers } from '@/lib/db/queries/portfolioPublish'
import type { GmailAccess } from '@/lib/google/scopes'
import {
  DEFAULT_JOB_COST_MS,
  TIER_PRIORITY_OFFSET,
  TIER_WEIGHT,
  dailyWorkPoolMs,
  pickWeeklyUsers,
  weeklyChainCostMs,
  weeklyReserveMs,
  pickSources,
  planCapacity,
  type ActivityTier,
  type PlanUser,
} from './capacity'
import { loadPlanAccounts, loadWeeklyFacts, type PlanAccount } from './plan-data'

export interface ScheduleResult {
  day: string
  /** Active (not suspended) accounts. */
  users: number
  /** Accounts skipped as dormant (no visit for DORMANT_AFTER_DAYS). */
  dormant: number
  /** Jobs the day needs. */
  planned: number
  /** Jobs actually inserted (the rest already existed for today). */
  enqueued: number
  /** Source polls planned today / pollable sources of the planned accounts. */
  polls: number
  pollableSources: number
  /** Users whose weekly company chain (discovery → boards → growth) is planned today. */
  weeklyCompanyRuns: number
}

export interface PlanOptions {
  /** Gmail jobs (sync, digest email, discovery email) only with access (owner-only in the beta). */
  gmail?: GmailAccess
  tier?: ActivityTier
}

const FULL_GMAIL: GmailAccess = { read: true, send: true }

/**
 * Plan one user's jobs for `day`. Discovery is one job per source picked by
 * the capacity plan, in claim order (best first: lib/queue/capacity.ts); the
 * Scam Shield re-check waits for those polls, the daily shortlist for the
 * re-check, and the discovery email for the shortlist (wait_for_type).
 * Gmail-dependent jobs are planned only with Gmail access, so an invitee
 * (no Gmail in the beta) never gets no-op or failing Gmail jobs.
 */
export function planUserJobs(
  userId: string,
  sourceIds: readonly string[],
  day: string,
  now: Date,
  radarSources: readonly RadarSource[] = [],
  opts: PlanOptions = {},
): EnqueueSpec[] {
  const gmail = opts.gmail ?? FULL_GMAIL
  const tierOffset = TIER_PRIORITY_OFFSET[opts.tier ?? 'active']
  const base = { userId, runAfter: now }
  const waitForPolls = { waitForType: JOB_TYPES.discoverySource }
  return [
    { ...base, type: JOB_TYPES.followups, idempotencyKey: jobKeys.followups(userId, day), priority: JOB_PRIORITY[JOB_TYPES.followups] },
    ...(gmail.read
      ? [{ ...base, type: JOB_TYPES.gmailSync, idempotencyKey: jobKeys.gmailSync(userId, day), priority: JOB_PRIORITY[JOB_TYPES.gmailSync] }]
      : []),
    ...(gmail.send
      ? [{ ...base, type: JOB_TYPES.digest, idempotencyKey: jobKeys.digest(userId, day), priority: JOB_PRIORITY[JOB_TYPES.digest] }]
      : []),
    // run_after steps 1 ms per rank so a user's best sources are claimed first.
    ...sourceIds.map((sourceId, i) => ({
      ...base,
      runAfter: new Date(now.getTime() + i),
      type: JOB_TYPES.discoverySource,
      payload: { sourceId },
      idempotencyKey: jobKeys.discoverySource(userId, sourceId, day),
      priority: JOB_PRIORITY[JOB_TYPES.discoverySource] + tierOffset,
    })),
    { ...base, type: JOB_TYPES.discoveryBenefits, idempotencyKey: jobKeys.discoveryBenefits(userId, day), priority: JOB_PRIORITY[JOB_TYPES.discoveryBenefits] },
    { ...base, ...waitForPolls, type: JOB_TYPES.scamReassess, idempotencyKey: jobKeys.scamReassess(userId, day), priority: JOB_PRIORITY[JOB_TYPES.scamReassess] },
    // polls → Scam Shield re-check → shortlist → discovery email: each waits
    // for the one before (wait_for_type), so the shortlist never includes a
    // posting the re-check would quarantine and the email can carry it.
    { ...base, waitForType: JOB_TYPES.scamReassess, type: JOB_TYPES.shortlist, idempotencyKey: jobKeys.shortlist(userId, day), priority: JOB_PRIORITY[JOB_TYPES.shortlist] },
    ...(gmail.send
      ? [{ ...base, waitForType: JOB_TYPES.shortlist, type: JOB_TYPES.discoveryEmail, idempotencyKey: jobKeys.discoveryEmail(userId, day), priority: JOB_PRIORITY[JOB_TYPES.discoveryEmail] }]
      : []),
    // AI Radar (lib/radar/schedule.ts): one job per source the user keeps
    // on, once they watch at least one term.
    ...radarSources.map((source) => ({
      ...base,
      type: JOB_TYPES.radarSource,
      payload: { source, trigger: 'daily' },
      idempotencyKey: jobKeys.radarSource(userId, source, day),
      priority: JOB_PRIORITY[JOB_TYPES.radarSource],
      // A failed source is recorded, not retried; one extra try covers a crash.
      maxAttempts: 2,
    })),
  ]
}

/** Expected lane time of a user's jobs other than source polls. */
export function fixedCostMs(gmail: GmailAccess, radarCount: number, portfolio: boolean): number {
  const c = DEFAULT_JOB_COST_MS
  return (
    c[JOB_TYPES.followups]! +
    c[JOB_TYPES.scamReassess]! +
    c[JOB_TYPES.shortlist]! +
    c[JOB_TYPES.discoveryBenefits]! +
    (gmail.read ? c[JOB_TYPES.gmailSync]! : 0) +
    (gmail.send ? c[JOB_TYPES.digest]! + c[JOB_TYPES.discoveryEmail]! : 0) +
    radarCount * c[JOB_TYPES.radarSource]! +
    (portfolio ? c[JOB_TYPES.portfolioPull]! : 0)
  )
}

/** The daily portfolio → profile sync for one user (idempotent per UTC day). */
export function portfolioPullSpec(userId: string, day: string, now: Date): EnqueueSpec {
  return {
    type: JOB_TYPES.portfolioPull,
    userId,
    runAfter: now,
    idempotencyKey: jobKeys.portfolioPull(userId, day),
    priority: JOB_PRIORITY[JOB_TYPES.portfolioPull],
    maxAttempts: 2,
  }
}

function toPlanUsers(accounts: readonly PlanAccount[], radar: ReadonlyMap<string, readonly RadarSource[]>, pulls: ReadonlySet<string>): PlanUser[] {
  return accounts.map((a) => ({
    userId: a.userId,
    tier: a.tier,
    sources: a.sources,
    fixedCostMs: fixedCostMs(a.gmail, radar.get(a.userId)?.length ?? 0, pulls.has(a.userId)),
  }))
}

/**
 * Queue today's jobs for ONE user right away (the same plan as the daily
 * scheduler). Used by "Run now" and when a dormant user comes back, so a
 * new or returning account doesn't wait for the next 09:00 UTC run. The
 * user gets an active user's fair share of the day's pool. Idempotent per
 * UTC day via the job keys.
 */
export async function scheduleUserToday(
  userId: string,
  now: Date = new Date(),
): Promise<{ day: string; enqueued: number }> {
  const day = utcDay(now)
  // Starter defaults first, so today's plan includes any new default sources.
  await applyDefaults(userId)
  const accounts = await loadPlanAccounts(now, userId)
  const me = accounts.find((a) => a.userId === userId)
  if (!me) return { day, enqueued: 0 }
  const radar = (await radarSourcesByUser(userId)).get(userId) ?? []
  const weights = accounts.reduce((s, a) => s + TIER_WEIGHT[a.tier], 0)
  const share = (dailyWorkPoolMs() * TIER_WEIGHT.active) / Math.max(TIER_WEIGHT.active, weights)
  const { ids } = pickSources(me.sources, share, now)
  const { created } = await enqueueMany(planUserJobs(userId, ids, day, now, radar, { gmail: me.gmail, tier: 'active' }))
  return { day, enqueued: created }
}

/**
 * Queue today's poll for a single source (e.g. right after it's added or
 * re-enabled). Returns false when today's poll for it was already queued.
 */
export async function enqueueSourcePollNow(
  userId: string,
  sourceId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const day = utcDay(now)
  const { created } = await enqueueMany([
    {
      userId,
      runAfter: now,
      type: JOB_TYPES.discoverySource,
      payload: { sourceId },
      idempotencyKey: jobKeys.discoverySource(userId, sourceId, day),
      priority: JOB_PRIORITY[JOB_TYPES.discoverySource],
    },
  ])
  return created > 0
}

/**
 * Daily scheduler: plan the day for every non-dormant account within the
 * Hobby cron budget (lib/queue/capacity.ts) and enqueue it in one
 * statement. Dormant accounts get nothing until they visit again.
 * Idempotent — a second call on the same UTC day (duplicate cron delivery,
 * the sync-all alias, a manual run) inserts nothing.
 */
export async function scheduleDailyJobs(now: Date = new Date()): Promise<ScheduleResult> {
  const day = utcDay(now)
  let accounts = await loadPlanAccounts(now)
  // Starter defaults for non-dormant accounts that haven't received the
  // current version yet (a no-op per user once applied). Sequential: one
  // small transaction each. New default sources join today's plan.
  let added = 0
  for (const a of accounts) {
    if (a.tier !== 'dormant') added += (await applyDefaults(a.userId)).addedSources
  }
  if (added > 0) accounts = await loadPlanAccounts(now)
  const live = accounts.filter((a) => a.tier !== 'dormant')
  const [radar, withPrefs, portfolioUsers, weekly] = await Promise.all([
    radarSourcesByUser(),
    // Company discovery needs target regions: users who saved Settings › Search.
    db.select({ id: userProfile.userId }).from(userProfile).where(isNotNull(userProfile.searchPrefsSavedAt)),
    // Portfolio → profile sync (lib/portfolio/pull.ts): users with a repository or an earlier pull.
    listPullUsers(),
    loadWeeklyFacts(now),
  ])
  const liveIds = new Set(live.map((a) => a.userId))
  const pulls = new Set(portfolioUsers.filter((id) => liveIds.has(id)))
  const plans = planCapacity(toPlanUsers(live, radar, pulls), undefined, now)
  const tierOf = new Map(live.map((a) => [a.userId, a.tier]))
  const weeklyUsers = pickWeeklyUsers(
    withPrefs
      .filter((u) => tierOf.has(u.id))
      .map((u) => ({ userId: u.id, tier: tierOf.get(u.id)!, daysSinceRun: weekly.daysSinceRun.get(u.id) ?? null })),
    weeklyReserveMs(),
    weeklyChainCostMs(weekly.observedMs),
  )

  const specs: EnqueueSpec[] = [
    {
      type: JOB_TYPES.reminders,
      userId: null,
      runAfter: now,
      idempotencyKey: jobKeys.reminders(day),
      priority: JOB_PRIORITY[JOB_TYPES.reminders],
    },
    {
      type: JOB_TYPES.usageSnapshot,
      userId: null,
      runAfter: now,
      idempotencyKey: jobKeys.usageSnapshot(day),
      priority: JOB_PRIORITY[JOB_TYPES.usageSnapshot],
    },
    ...live.flatMap((a) =>
      planUserJobs(a.userId, plans.get(a.userId)?.sourceIds ?? [], day, now, radar.get(a.userId) ?? [], { gmail: a.gmail, tier: a.tier }),
    ),
    // Company discovery (lib/company-discovery): planned daily, keyed per ISO
    // week, so it runs once a week per user.
    // Company discovery (lib/company-discovery) and the board auto-detect and
    // growth jobs it chains: weekly at most (ISO-week key), and only for the
    // most overdue users the day's weekly reserve covers (lib/queue/capacity.ts).
    ...weeklyUsers.map((id) => weeklyCompanySpec(id, now)),
    ...[...pulls].map((id) => portfolioPullSpec(id, day, now)),
  ]
  const { created } = await enqueueMany(specs)
  return {
    day,
    users: accounts.length,
    dormant: accounts.length - live.length,
    planned: specs.length,
    enqueued: created,
    polls: [...plans.values()].reduce((s, p) => s + p.sourceIds.length, 0),
    weeklyCompanyRuns: weeklyUsers.length,
    pollableSources: live.reduce((s, a) => s + a.sources.length, 0),
  }
}
