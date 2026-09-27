import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { JOB_LABELS, jobLabel } from './job-types'
import { describeSummary, readRunRecord, type AttemptError, type JobSummary } from './run-summary'
import { nextRunAt } from './schedule-times'
import type { JobStatus } from './types'

/**
 * Settings › Background jobs "Last runs": the owner's jobs plus the global
 * ones (reminders, usage snapshot — counts only, no personal data). Never
 * payloads, locks or worker ids.
 */

export interface JobRunView {
  id: string
  type: string
  label: string
  status: JobStatus
  attempts: number
  maxAttempts: number
  startedAt: Date | null
  finishedAt: Date | null
  updatedAt: Date
  durationMs: number | null
  summary: JobSummary | null
  summaryLine: string
  errors: AttemptError[]
  lastError: string | null
  /** False for global jobs (not tied to this user). */
  mine: boolean
}

export interface LastRunRow {
  type: string
  label: string
  last: JobRunView | null
  /** When this type next runs (a pending job's drain, or the next schedule). */
  nextAt: Date
  /** A job of this type is queued or waiting to retry. */
  pending: boolean
}

export const RUN_HISTORY_LIMIT = 20

function visibleTo(userId: string): SQL {
  return or(eq(queueJobs.userId, userId), isNull(queueJobs.userId)) as SQL
}

const RAN_STATUSES = ['running', 'done', 'failed', 'dead'] as const

const runColumns = {
  id: queueJobs.id,
  type: queueJobs.type,
  userId: queueJobs.userId,
  status: queueJobs.status,
  attempts: queueJobs.attempts,
  maxAttempts: queueJobs.maxAttempts,
  startedAt: queueJobs.startedAt,
  finishedAt: queueJobs.finishedAt,
  updatedAt: queueJobs.updatedAt,
  durationMs: queueJobs.durationMs,
  result: queueJobs.result,
  lastError: queueJobs.lastError,
}

type RunRow = {
  id: string
  type: string
  userId: string | null
  status: string
  attempts: number
  maxAttempts: number
  startedAt: Date | null
  finishedAt: Date | null
  updatedAt: Date
  durationMs: number | null
  result: unknown
  lastError: string | null
}

function toView(r: RunRow): JobRunView {
  const record = readRunRecord(r.result)
  const summary = record.summary ?? null
  return {
    id: r.id,
    type: r.type,
    label: jobLabel(r.type),
    status: r.status as JobStatus,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    updatedAt: r.updatedAt,
    durationMs: r.durationMs,
    summary,
    summaryLine: describeSummary(summary),
    errors: record.errors ?? [],
    lastError: r.lastError,
    mine: r.userId !== null,
  }
}

/** One row per known job type: its latest run and its next scheduled time. */
export async function getLastRuns(userId: string, now: Date = new Date()): Promise<LastRunRow[]> {
  const [latest, pending] = await Promise.all([
    db
      .selectDistinctOn([queueJobs.type], runColumns)
      .from(queueJobs)
      .where(and(visibleTo(userId), inArray(queueJobs.status, [...RAN_STATUSES])))
      .orderBy(queueJobs.type, desc(queueJobs.updatedAt)),
    db
      .select({ type: queueJobs.type, runAfter: sql<Date | string>`min(${queueJobs.runAfter})` })
      .from(queueJobs)
      .where(and(visibleTo(userId), inArray(queueJobs.status, ['queued', 'failed'])))
      .groupBy(queueJobs.type),
  ])
  const latestByType = new Map(latest.map((r) => [r.type, toView(r)]))
  const pendingByType = new Map(pending.map((p) => [p.type, new Date(p.runAfter)]))
  const types = [...new Set([...Object.keys(JOB_LABELS), ...latestByType.keys()])]
  return types.map((type) => {
    const due = pendingByType.get(type) ?? null
    return {
      type,
      label: jobLabel(type),
      last: latestByType.get(type) ?? null,
      nextAt: nextRunAt(now, due),
      pending: due !== null,
    }
  })
}

/** The last RUN_HISTORY_LIMIT runs of one job type (newest first). */
export async function getRunHistory(
  userId: string,
  type: string,
  limit = RUN_HISTORY_LIMIT,
): Promise<JobRunView[]> {
  const rows = await db
    .select(runColumns)
    .from(queueJobs)
    .where(and(visibleTo(userId), eq(queueJobs.type, type), inArray(queueJobs.status, [...RAN_STATUSES])))
    .orderBy(desc(queueJobs.updatedAt))
    .limit(Math.max(1, Math.min(limit, 50)))
  return rows.map(toView)
}
