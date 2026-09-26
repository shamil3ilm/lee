import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, queueUserState } from '@/lib/db/schema'
import { drain, type DrainOptions } from './drain'
import { jobLabel } from './job-types'
import { JOB_STATUSES, type JobStatus } from './types'
import { scheduleUserToday } from './scheduler'

/** Owner-facing view of one failed job — no payload, lock or worker ids. */
export interface JobFailureView {
  id: string
  label: string
  status: Extract<JobStatus, 'failed' | 'dead'>
  attempts: number
  maxAttempts: number
  error: string | null
  updatedAt: Date
  /** When a `failed` job retries. */
  retryAt: Date | null
}

export interface QueueOverview {
  counts: Record<JobStatus, number>
  failures: JobFailureView[]
  lastDrainAt: Date | null
}

export const RECENT_FAILURES_LIMIT = 10

/** Settings › Background jobs — strictly this user's jobs. */
export async function getQueueOverview(userId: string): Promise<QueueOverview> {
  const [countRows, failureRows, stateRows] = await Promise.all([
    db
      .select({ status: queueJobs.status, n: sql<number>`count(*)::int` })
      .from(queueJobs)
      .where(eq(queueJobs.userId, userId))
      .groupBy(queueJobs.status),
    db
      .select({
        id: queueJobs.id,
        type: queueJobs.type,
        status: queueJobs.status,
        attempts: queueJobs.attempts,
        maxAttempts: queueJobs.maxAttempts,
        lastError: queueJobs.lastError,
        updatedAt: queueJobs.updatedAt,
        runAfter: queueJobs.runAfter,
      })
      .from(queueJobs)
      .where(and(eq(queueJobs.userId, userId), inArray(queueJobs.status, ['failed', 'dead'])))
      .orderBy(desc(queueJobs.updatedAt))
      .limit(RECENT_FAILURES_LIMIT),
    db
      .select({ lastDrainAt: queueUserState.lastDrainAt })
      .from(queueUserState)
      .where(eq(queueUserState.userId, userId)),
  ])
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>
  for (const r of countRows) {
    if ((JOB_STATUSES as readonly string[]).includes(r.status)) counts[r.status as JobStatus] = Number(r.n)
  }
  return {
    counts,
    failures: failureRows.map((r) => ({
      id: r.id,
      label: jobLabel(r.type),
      status: r.status === 'dead' ? 'dead' : 'failed',
      attempts: r.attempts,
      maxAttempts: r.maxAttempts,
      error: r.lastError,
      updatedAt: r.updatedAt,
      retryAt: r.status === 'failed' ? r.runAfter : null,
    })),
    lastDrainAt: stateRows[0]?.lastDrainAt ?? null,
  }
}

export const RUN_NOW_BUDGET_MS = 25_000
export const RUN_NOW_MAX_JOBS = 5
export const RUN_NOW_INTERVAL_MS = 30_000

export type RunNowResult =
  | { status: 'throttled' }
  | { status: 'ran'; done: number; failed: number; remaining: 'none' | 'more' }

/**
 * "Run now": drain this user's due jobs within a small budget, at most
 * once per RUN_NOW_INTERVAL_MS (one conditional upsert claims the slot).
 */
export async function runNowForUser(
  userId: string,
  opts: Pick<DrainOptions, 'registry'> & {
    now?: Date
    /**
     * Queue today's work first so "Run now" does something even before the
     * daily scheduler has run (a new account, or right after adding sources).
     * Idempotent per UTC day. Injectable for tests.
     */
    scheduleToday?: (userId: string, now: Date) => Promise<unknown>
  } = {},
): Promise<RunNowResult> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - RUN_NOW_INTERVAL_MS)
  const claimed = await db
    .insert(queueUserState)
    .values({ userId, lastManualDrainAt: now })
    .onConflictDoUpdate({
      target: queueUserState.userId,
      set: { lastManualDrainAt: now },
      setWhere: sql`${queueUserState.lastManualDrainAt} is null or ${queueUserState.lastManualDrainAt} <= ${since.toISOString()}::timestamptz`,
    })
    .returning()
  if (claimed.length === 0) return { status: 'throttled' }
  await (opts.scheduleToday ?? scheduleUserToday)(userId, now)
  const r = await drain({
    userId,
    budgetMs: RUN_NOW_BUDGET_MS,
    maxJobs: RUN_NOW_MAX_JOBS,
    concurrency: 1,
    registry: opts.registry,
  })
  return {
    status: 'ran',
    done: r.done,
    failed: r.failed + r.dead,
    remaining: r.stoppedBy === 'empty' ? 'none' : 'more',
  }
}
