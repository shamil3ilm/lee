import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueUserState } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { JobTimeoutError, PermanentJobError, sanitizeError } from './errors'
import { claim, complete, fail, recoverStale, release } from './queue'
import type { HandlerRegistry, RegisteredHandler } from './registry'
import type { ClaimedJob, JobResult } from './types'

export interface DrainOptions {
  /** Wall-clock budget: no job starts once it is (nearly) spent. */
  budgetMs: number
  maxJobs?: number
  types?: readonly string[]
  /** Only this user's jobs. */
  userId?: string
  /** Jobs run at once (I/O-bound work: AI calls, Gmail, source polls). */
  concurrency?: number
  workerId?: string
  /** Defaults to the app registry (lib/queue/handlers). */
  registry?: HandlerRegistry
  clock?: () => number
  random?: () => number
}

export type DrainStop = 'empty' | 'budget' | 'max_jobs'

export interface DrainResult {
  workerId: string
  recovered: number
  claimed: number
  done: number
  failed: number
  dead: number
  released: number
  stoppedBy: DrainStop
  durationMs: number
  /** Handler metrics summed per key (e.g. reminders_added). */
  metrics: Record<string, number>
  /** Sanitized failure messages and handler warnings, prefixed by job type. */
  errors: string[]
}

export const DEFAULT_MAX_JOBS = 500
/** Stop starting jobs when less than this share of the budget is left… */
const STOP_MARGIN_RATIO = 0.05
/** …but never with less than this, nor reserve more than the cap. */
const STOP_MARGIN_MIN_MS = 1_000
const STOP_MARGIN_MAX_MS = 10_000

export function stopMarginMs(budgetMs: number): number {
  return Math.min(STOP_MARGIN_MAX_MS, Math.max(STOP_MARGIN_MIN_MS, budgetMs * STOP_MARGIN_RATIO))
}

async function defaultRegistry(): Promise<HandlerRegistry> {
  // Lazy: the handlers import AI, Gmail and discovery modules.
  const { appRegistry } = await import('./handlers')
  return appRegistry
}

function withTimeout(
  handler: RegisteredHandler,
  job: ClaimedJob,
  timeoutMs: number,
  deadline: number,
): Promise<JobResult> {
  const ac = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort()
      reject(new JobTimeoutError(timeoutMs))
    }, timeoutMs)
  })
  const work = handler.execute({ job, deadline, signal: ac.signal })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

interface Tally {
  claimed: number
  done: number
  failed: number
  dead: number
  released: number
  metrics: Record<string, number>
  errors: string[]
  users: Set<string>
}

function addMetrics(into: Record<string, number>, metrics: JobResult['metrics']): void {
  for (const [k, v] of Object.entries(metrics ?? {})) into[k] = (into[k] ?? 0) + v
}

/**
 * Drain due jobs within a time budget. Each lane claims one job at a time
 * (FOR UPDATE SKIP LOCKED, so parallel drains never collide), runs its
 * handler under the per-type timeout, then completes or fails it. A lane
 * stops when nothing is due, `maxJobs` jobs were started, or the budget is
 * nearly spent — work that does not fit waits for the next drain.
 */
export async function drain(opts: DrainOptions): Promise<DrainResult> {
  const clock = opts.clock ?? (() => Date.now())
  const startedAt = clock()
  const budgetDeadline = startedAt + Math.max(0, opts.budgetMs)
  const stopAt = budgetDeadline - stopMarginMs(opts.budgetMs)
  const maxJobs = opts.maxJobs ?? DEFAULT_MAX_JOBS
  const workerId = opts.workerId ?? `drain-${randomUUID()}`
  const registry = opts.registry ?? (await defaultRegistry())
  const recovered = await recoverStale(new Date(startedAt))
  const tally: Tally = {
    claimed: 0, done: 0, failed: 0, dead: 0, released: 0, metrics: {}, errors: [], users: new Set(),
  }
  let started = 0
  let stoppedBy: DrainStop = 'empty'

  const runOne = async (job: ClaimedJob): Promise<'ran' | 'released'> => {
    const handler = registry.get(job.type)
    const now = clock()
    if (handler && budgetDeadline - now < handler.minBudgetMs) {
      await release(job.id, workerId, new Date(now))
      tally.released += 1
      return 'released'
    }
    if (job.userId) tally.users.add(job.userId)
    try {
      if (!handler) throw new PermanentJobError(`unknown job type ${job.type}`)
      const timeoutMs = Math.max(1, Math.min(handler.timeoutMs, budgetDeadline - now))
      const result = await withTimeout(handler, job, timeoutMs, now + timeoutMs)
      await complete(job.id, workerId, new Date(clock()))
      tally.done += 1
      addMetrics(tally.metrics, result.metrics)
      for (const w of result.warnings ?? []) tally.errors.push(`${job.type}: ${sanitizeError(w)}`)
    } catch (err) {
      const outcome = await fail(job, workerId, err, {
        now: new Date(clock()),
        random: opts.random,
        permanent: err instanceof PermanentJobError,
      })
      if (outcome.status === 'dead') tally.dead += 1
      else tally.failed += 1
      tally.errors.push(`${job.type}: ${sanitizeError(err)}`)
      logger.warn('queue_job_failed', {
        jobId: job.id, type: job.type, attempt: job.attempts, status: outcome.status, err: sanitizeError(err),
      })
    }
    return 'ran'
  }

  const lane = async (): Promise<void> => {
    for (;;) {
      if (started >= maxJobs) {
        stoppedBy = 'max_jobs'
        return
      }
      if (clock() >= stopAt) {
        stoppedBy = 'budget'
        return
      }
      started += 1
      const [job] = await claim(1, workerId, { userId: opts.userId, types: opts.types, now: new Date(clock()) })
      if (!job) {
        started -= 1
        return
      }
      tally.claimed += 1
      // A released job is due again at once; the lane stops rather than
      // re-claim it in a loop. Cheaper jobs wait for the next drain.
      if ((await runOne(job)) === 'released') {
        started -= 1
        stoppedBy = 'budget'
        return
      }
    }
  }

  const lanes = Math.max(1, Math.floor(opts.concurrency ?? 1))
  await Promise.all(Array.from({ length: lanes }, lane))
  await touchUsers([...tally.users], new Date(clock()))

  const result: DrainResult = {
    workerId,
    recovered,
    claimed: tally.claimed,
    done: tally.done,
    failed: tally.failed,
    dead: tally.dead,
    released: tally.released,
    stoppedBy,
    durationMs: clock() - startedAt,
    metrics: tally.metrics,
    errors: tally.errors,
  }
  logger.info('queue_drain', {
    workerId, userScoped: Boolean(opts.userId), recovered, claimed: result.claimed, done: result.done,
    failed: result.failed, dead: result.dead, released: result.released, stoppedBy, durationMs: result.durationMs,
  })
  return result
}

/** Record "a drain ran jobs for you" — one upsert per touched user. */
async function touchUsers(userIds: readonly string[], now: Date): Promise<void> {
  if (userIds.length === 0) return
  try {
    await db
      .insert(queueUserState)
      .values(userIds.map((userId) => ({ userId, lastDrainAt: now })))
      .onConflictDoUpdate({ target: queueUserState.userId, set: { lastDrainAt: sql`excluded.last_drain_at` } })
  } catch (err) {
    logger.warn('queue_touch_users_failed', { err: sanitizeError(err) })
  }
}
