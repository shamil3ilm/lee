import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sources, users } from '@/lib/db/schema'
import { MAX_ERRORS_BEFORE_SKIP } from '@/lib/discovery/service'
import { JOB_PRIORITY, JOB_TYPES, jobKeys, utcDay } from './job-types'
import { enqueueMany, type EnqueueSpec } from './queue'

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
 * (enabled, under the error limit); the discovery email and the Scam Shield
 * re-check wait for those polls (wait_for_type).
 */
export function planUserJobs(userId: string, sourceIds: readonly string[], day: string, now: Date): EnqueueSpec[] {
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
    { ...base, ...waitForPolls, type: JOB_TYPES.discoveryEmail, idempotencyKey: jobKeys.discoveryEmail(userId, day), priority: JOB_PRIORITY[JOB_TYPES.discoveryEmail] },
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
  const active = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(eq(sources.userId, userId), eq(sources.enabled, true), lt(sources.errorCount, MAX_ERRORS_BEFORE_SKIP)),
    )
    .orderBy(sources.createdAt)
  const { created } = await enqueueMany(planUserJobs(userId, active.map((s) => s.id), day, now))
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
  const [allUsers, activeSources] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db
      .select({ id: sources.id, userId: sources.userId })
      .from(sources)
      .where(and(eq(sources.enabled, true), lt(sources.errorCount, MAX_ERRORS_BEFORE_SKIP)))
      .orderBy(sources.createdAt),
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
    ...allUsers.flatMap((u) => planUserJobs(u.id, byUser.get(u.id) ?? [], day, now)),
  ]
  const { created } = await enqueueMany(specs)
  return { day, users: allUsers.length, planned: specs.length, enqueued: created }
}
