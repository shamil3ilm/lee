import { and, eq, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { backoffMs } from './backoff'
import { sanitizeError } from './errors'
import type { ClaimedJob, JobStatus } from './types'

/**
 * Lock held by a claimed job. Longer than any function can live (Vercel
 * maxDuration 300 s), so a live worker never loses its job to stale-lock
 * recovery; a dead worker's job is recovered on the next drain after this.
 */
export const LOCK_MS = 6 * 60 * 1000
export const DEFAULT_MAX_ATTEMPTS = 5

export interface EnqueueOptions {
  userId?: string | null
  runAfter?: Date
  /** Unique per job type; a second enqueue with the same key is a no-op. */
  idempotencyKey?: string
  maxAttempts?: number
  priority?: number
  waitForType?: string
}

export interface EnqueueSpec extends EnqueueOptions {
  type: string
  payload?: Record<string, unknown>
}

export interface EnqueueResult {
  /** Rows actually inserted (duplicates by idempotency key are skipped). */
  created: number
  ids: string[]
}

function toValues(spec: EnqueueSpec): typeof queueJobs.$inferInsert {
  return {
    type: spec.type,
    payload: spec.payload ?? {},
    userId: spec.userId ?? null,
    runAfter: spec.runAfter ?? new Date(),
    idempotencyKey: spec.idempotencyKey ?? null,
    maxAttempts: spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    priority: spec.priority ?? 100,
    waitForType: spec.waitForType ?? null,
  }
}

/** Insert many jobs in one statement; idempotent via ON CONFLICT DO NOTHING. */
export async function enqueueMany(
  specs: readonly EnqueueSpec[],
  client: DbClient = db,
): Promise<EnqueueResult> {
  if (specs.length === 0) return { created: 0, ids: [] }
  const rows = await client
    .insert(queueJobs)
    .values(specs.map(toValues))
    .onConflictDoNothing({ target: [queueJobs.type, queueJobs.idempotencyKey] })
    .returning()
  return { created: rows.length, ids: rows.map((r) => r.id) }
}

/**
 * Add one job. Returns its id, or null when a job with the same
 * (type, idempotencyKey) already exists — in any status.
 */
export async function enqueue(
  type: string,
  payload: Record<string, unknown> = {},
  opts: EnqueueOptions = {},
  client: DbClient = db,
): Promise<string | null> {
  const { ids } = await enqueueMany([{ ...opts, type, payload }], client)
  return ids[0] ?? null
}

function toRows<T>(result: unknown): T[] {
  // postgres-js returns an array, PGlite `{ rows }`.
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

function affected(result: unknown): number {
  const r = result as { count?: number; affectedRows?: number; rowCount?: number }
  return Number(r.count ?? r.affectedRows ?? r.rowCount ?? 0)
}

interface RawJob {
  id: string
  user_id: string | null
  type: string
  payload: unknown
  attempts: number | string
  max_attempts: number | string
  priority: number | string
  created_at: Date | string
}

function toClaimed(r: RawJob): ClaimedJob {
  const payload = typeof r.payload === 'string' ? (JSON.parse(r.payload) as unknown) : r.payload
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    createdAt: new Date(r.created_at),
  }
}

export interface ClaimOptions {
  /** Only this user's jobs (visit / "Run now" drains). */
  userId?: string
  types?: readonly string[]
  now?: Date
  lockMs?: number
}

/**
 * Atomically claim up to `n` due jobs for `workerId`:
 *
 *   UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING …
 *
 * On Postgres, concurrent drains never claim the same row: each inner
 * SELECT skips rows another transaction has locked. (PGlite — used in
 * tests — is single-connection, so statements are serialized and the same
 * query is trivially exclusive there; tests cover the logic, not the lock.)
 *
 * Due = status queued/failed with run_after <= now, and not waiting on an
 * unfinished job of its `wait_for_type` for the same user. A dependency
 * that is `done` or `dead` no longer blocks: like the old sync-all, the
 * discovery email still goes out when a source poll gave up. Claiming counts
 * as an attempt, so a job that keeps killing its worker still runs out.
 */
export async function claim(
  n: number,
  workerId: string,
  opts: ClaimOptions = {},
  client: DbClient = db,
): Promise<ClaimedJob[]> {
  const limit = Math.max(0, Math.floor(n))
  if (limit === 0) return []
  const now = opts.now ?? new Date()
  const lockUntil = new Date(now.getTime() + (opts.lockMs ?? LOCK_MS))
  const filters: SQL[] = []
  if (opts.userId) filters.push(sql`and c.user_id = ${opts.userId}`)
  if (opts.types && opts.types.length > 0) {
    filters.push(sql`and c.type in (${sql.join(opts.types.map((t) => sql`${t}`), sql`, `)})`)
  }
  const result = await client.execute(sql`
    update queue_jobs j
    set status = 'running',
        attempts = j.attempts + 1,
        locked_by = ${workerId},
        locked_until = ${lockUntil.toISOString()}::timestamptz,
        updated_at = ${now.toISOString()}::timestamptz
    where j.id in (
      select c.id from queue_jobs c
      where c.status in ('queued', 'failed')
        and c.run_after <= ${now.toISOString()}::timestamptz
        ${sql.join(filters, sql` `)}
        and (c.wait_for_type is null or not exists (
          select 1 from queue_jobs d
          where d.type = c.wait_for_type
            and d.user_id is not distinct from c.user_id
            and d.status in ('queued', 'failed', 'running')
        ))
      order by c.priority, c.run_after, c.created_at
      for update of c skip locked
      limit ${limit}
    )
    returning j.id, j.user_id, j.type, j.payload, j.attempts, j.max_attempts, j.priority, j.created_at
  `)
  return toRows<RawJob>(result)
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    .map(toClaimed)
}

function ownedBy(jobId: string, workerId: string): SQL | undefined {
  return and(eq(queueJobs.id, jobId), eq(queueJobs.lockedBy, workerId), eq(queueJobs.status, 'running'))
}

/**
 * Mark a claimed job done. Returns false when the worker no longer owns it
 * (its lock expired and another drain recovered it) — nothing is written.
 */
export async function complete(
  jobId: string,
  workerId: string,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .update(queueJobs)
    .set({ status: 'done', finishedAt: now, updatedAt: now, lockedBy: null, lockedUntil: null, lastError: null })
    .where(ownedBy(jobId, workerId))
    .returning()
  return rows.length > 0
}

/**
 * Hand a claimed job back untouched — not enough drain budget left to start
 * it. The claim's attempt is refunded so budget pressure never kills a job.
 */
export async function release(
  jobId: string,
  workerId: string,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .update(queueJobs)
    .set({
      status: 'queued',
      attempts: sql`greatest(${queueJobs.attempts} - 1, 0)`,
      lockedBy: null,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(ownedBy(jobId, workerId))
    .returning()
  return rows.length > 0
}

export interface FailOptions {
  now?: Date
  random?: () => number
  /** Skip retries (bad payload, unknown type). */
  permanent?: boolean
}

export interface FailOutcome {
  owned: boolean
  status: Extract<JobStatus, 'failed' | 'dead'>
  retryAt: Date | null
}

/**
 * Record a failed attempt. With attempts left the job becomes `failed` and
 * is retried after an exponential backoff with jitter; at max_attempts (or
 * for a permanent error) it becomes `dead` until the owner retries it.
 */
export async function fail(
  job: Pick<ClaimedJob, 'id' | 'attempts' | 'maxAttempts'>,
  workerId: string,
  err: unknown,
  opts: FailOptions = {},
  client: DbClient = db,
): Promise<FailOutcome> {
  const now = opts.now ?? new Date()
  const dead = opts.permanent === true || job.attempts >= job.maxAttempts
  const retryAt = dead ? null : new Date(now.getTime() + backoffMs(job.attempts, opts.random))
  const rows = await client
    .update(queueJobs)
    .set({
      status: dead ? 'dead' : 'failed',
      lastError: sanitizeError(err),
      updatedAt: now,
      lockedBy: null,
      lockedUntil: null,
      ...(dead ? { finishedAt: now } : { runAfter: retryAt as Date }),
    })
    .where(ownedBy(job.id, workerId))
    .returning()
  return { owned: rows.length > 0, status: dead ? 'dead' : 'failed', retryAt }
}

/**
 * Stale lock recovery: running jobs whose lock expired (the worker died or
 * was frozen) go back to queued, or to dead once their attempts are spent.
 * Returns the number of jobs recovered.
 */
export async function recoverStale(now: Date = new Date(), client: DbClient = db): Promise<number> {
  const ts = now.toISOString()
  const result = await client.execute(sql`
    update queue_jobs
    set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
        finished_at = case when attempts >= max_attempts then ${ts}::timestamptz else null end,
        run_after = ${ts}::timestamptz,
        locked_by = null,
        locked_until = null,
        last_error = 'Stopped before finishing; will retry.',
        updated_at = ${ts}::timestamptz
    where status = 'running' and locked_until < ${ts}::timestamptz
  `)
  return affected(result)
}

/**
 * Owner-scoped retry of a dead job: back to queued with a fresh attempt
 * budget, due now. Returns false when the job is not this user's or not dead.
 */
export async function retryDead(
  userId: string,
  jobId: string,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .update(queueJobs)
    .set({ status: 'queued', attempts: 0, runAfter: now, finishedAt: null, updatedAt: now })
    .where(and(eq(queueJobs.id, jobId), eq(queueJobs.userId, userId), eq(queueJobs.status, 'dead')))
    .returning()
  return rows.length > 0
}
