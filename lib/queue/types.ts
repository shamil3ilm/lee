import type { queueJobs } from '@/lib/db/schema'
import type { JobSummary } from './run-summary'

/**
 * Durable job queue (architecture review A3). A job moves through:
 *
 *   queued ──claim──▶ running ──complete──▶ done
 *                        │
 *                        └──fail──▶ failed (retry at run_after) ──claim──▶ running …
 *                                   dead   (attempts exhausted; Settings can retry)
 *
 * A running job whose lock expired (the function died mid-job) goes back to
 * queued — or to dead once its attempts are spent.
 *
 * A queued or failed job can also end as `superseded` (never ran): a newer
 * job for the same subject replaced it (lib/queue/coalesce.ts). Terminal,
 * not a failure; pruned like `done`.
 */
export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'dead', 'superseded'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export type QueueJobRow = typeof queueJobs.$inferSelect

/** The subset of a job row a handler (and the drain loop) works with. */
export interface ClaimedJob {
  id: string
  userId: string | null
  type: string
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  createdAt: Date
  /** Claimed past WAIT_FOR_MAX_MS while its `wait_for_type` dependency was still unfinished. */
  waitedOut?: boolean
}

/** Numbers a handler reports; the drain loop sums them per key. */
export type JobMetrics = Readonly<Record<string, number>>

export interface JobResult {
  metrics?: JobMetrics
  /**
   * Non-fatal problems worth surfacing in the cron response (e.g. one
   * discovery source returned 500). The job still counts as done.
   */
  warnings?: readonly string[]
  /** What this run did, stored on the job row (lib/queue/run-summary.ts). */
  summary?: JobSummary
}

export interface HandlerContext<P> {
  job: ClaimedJob
  payload: P
  /** Epoch ms: stop starting new work after this (cooperative time box). */
  deadline: number
  /** Aborted when the per-type timeout fires. */
  signal: AbortSignal
}
