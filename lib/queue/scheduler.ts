import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sources, userProfile, users } from '@/lib/db/schema'
import { MAX_ERRORS_BEFORE_SKIP } from '@/lib/discovery/service'
import { JOB_PRIORITY, JOB_TYPES, jobKeys, utcDay } from './job-types'
import { enqueueMany, type EnqueueSpec } from './queue'
import { applyDefaults } from '@/lib/defaults/apply'
import { radarSourcesByUser } from '@/lib/radar/schedule'
import type { RadarSource } from '@/lib/radar/types'
import { weeklyCompanySpec } from '@/lib/company-discovery/schedule'

export interface ScheduleResult {
  day: string
  users: number
  /** Jobs the day needs. */
  planned: number
  /** Jobs actually inserted (the rest already existed for today). */
  enqueued: number
}

/**
 * Plan one user's jobs for `day`. Discovery is one job per active source
 * (enabled, under the error limit); the Scam Shield re-check waits for those
 * polls, the daily shortlist for the re-check, and the discovery email for
 * the shortlist (wait_for_type).
 */
export function planUserJobs(
  userId: string,
  sourceIds: readonly string[],
  day: string,
  now: Date,
  radarSources: readonly RadarSource[] = [],
): EnqueueSpec[] {
  const base = { userId, runAfter: now }
  const waitForPolls = { waitForType: JOB_TYPES.discoverySource }
  return [
    { ...base, type: JOB_TYPES.followups, idempotencyKey: jobKeys.followups(userId, day), priority: JOB_PRIORITY[JOB_TYPES.followups] },
    { ...base, type: JOB_TYPES.gmailSync, idempotencyKey: jobKeys.gmailSync(userId, day), priority: JOB_PRIORITY[JOB_TYPES.gmailSync] },
    { ...base, type: JOB_TYPES.digest, idempotencyKey: jobKeys.digest(userId, day), priority: JOB_PRIORITY[JOB_TYPES.digest] },
    ...sourceIds.map((sourceId) => ({
      ...base,
      type: JOB_TYPES.discoverySource,
      payload: { sourceId },
      idempotencyKey: jobKeys.discoverySource(userId, sourceId, day),
      priority: JOB_PRIORITY[JOB_TYPES.discoverySource],
    })),
    { ...base, ...waitForPolls, type: JOB_TYPES.scamReassess, idempotencyKey: jobKeys.scamReassess(userId, day), priority: JOB_PRIORITY[JOB_TYPES.scamReassess] },
    // polls → Scam Shield re-check → shortlist → discovery email: each waits
    // for the one before (wait_for_type), so the shortlist never includes a
    // posting the re-check would quarantine and the email can carry it.
    { ...base, waitForType: JOB_TYPES.scamReassess, type: JOB_TYPES.shortlist, idempotencyKey: jobKeys.shortlist(userId, day), priority: JOB_PRIORITY[JOB_TYPES.shortlist] },
    { ...base, waitForType: JOB_TYPES.shortlist, type: JOB_TYPES.discoveryEmail, idempotencyKey: jobKeys.discoveryEmail(userId, day), priority: JOB_PRIORITY[JOB_TYPES.discoveryEmail] },
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

/**
 * Queue today's jobs for ONE user right away (the same plan as the daily
 * scheduler). Used by "Run now" so a new account doesn't wait for the next
 * 09:00 UTC scheduler run. Idempotent per UTC day via the job keys.
 */
export async function scheduleUserToday(
  userId: string,
  now: Date = new Date(),
): Promise<{ day: string; enqueued: number }> {
  const day = utcDay(now)
  // Starter defaults first, so today's plan includes any new default sources.
  await applyDefaults(userId)
  const active = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(eq(sources.userId, userId), eq(sources.enabled, true), lt(sources.errorCount, MAX_ERRORS_BEFORE_SKIP)),
    )
    .orderBy(sources.createdAt)
  const radar = (await radarSourcesByUser(userId)).get(userId) ?? []
  const { created } = await enqueueMany(planUserJobs(userId, active.map((s) => s.id), day, now, radar))
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
 * Daily scheduler: enqueue the day's jobs for every user in one statement.
 * Idempotent — a second call on the same UTC day (duplicate cron delivery,
 * the sync-all alias, a manual run) inserts nothing.
 */
export async function scheduleDailyJobs(now: Date = new Date()): Promise<ScheduleResult> {
  const day = utcDay(now)
  // Starter defaults for anyone who hasn't received the current version yet
  // (a no-op per user once applied). Sequential: one small transaction each.
  for (const u of await db.select({ id: users.id }).from(users)) {
    await applyDefaults(u.id)
  }
  const [allUsers, activeSources, radar, withPrefs] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db
      .select({ id: sources.id, userId: sources.userId })
      .from(sources)
      .where(and(eq(sources.enabled, true), lt(sources.errorCount, MAX_ERRORS_BEFORE_SKIP)))
      .orderBy(sources.createdAt),
    radarSourcesByUser(),
    // Company discovery needs target regions: users who saved Settings › Search.
    db.select({ id: userProfile.userId }).from(userProfile).where(isNotNull(userProfile.searchPrefsSavedAt)),
  ])
  const byUser = new Map<string, string[]>()
  for (const s of activeSources) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s.id])

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
    ...allUsers.flatMap((u) => planUserJobs(u.id, byUser.get(u.id) ?? [], day, now, radar.get(u.id) ?? [])),
    // Company discovery (lib/company-discovery): planned daily, keyed per ISO
    // week, so it runs once a week per user.
    ...withPrefs.map((u) => weeklyCompanySpec(u.id, now)),
  ]
  const { created } = await enqueueMany(specs)
  return { day, users: allUsers.length, planned: specs.length, enqueued: created }
}
