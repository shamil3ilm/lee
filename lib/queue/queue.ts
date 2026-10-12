import { and, eq, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { backoffMs } from './backoff'
import { sanitizeError } from './errors'
import { capSummary, MAX_ATTEMPT_ERRORS, type JobSummary } from './run-summary'
import { coalesceKey, coalesceMode, type CoalesceMode } from './coalesce'
import { JOB_TYPES } from './job-types'
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
  /** Rows actually inserted (duplicate keys and merged polls are skipped). */
  created: number
  ids: string[]
  /**
   * For `merge` types (source polls, lib/queue/coalesce.ts): the pending job
   * of each spec's subject — the one just inserted or the one it was merged
   * into. A drain can target exactly these (DrainOptions.jobIds).
   */
  pending: string[]
}

interface JobValues {
  type: string
  payload: Record<string, unknown>
  userId: string | null
  runAfter: Date
  idempotencyKey: string | null
  coalesceKey: string | null
  maxAttempts: number
  priority: number
  waitForType: string | null
}

function toValues(spec: EnqueueSpec): JobValues {
  const payload = spec.payload ?? {}
  const userId = spec.userId ?? null
  return {
    type: spec.type,
    payload,
    userId,
    runAfter: spec.runAfter ?? new Date(),
    idempotencyKey: spec.idempotencyKey ?? null,
    coalesceKey: coalesceKey(spec.type, userId, payload),
    maxAttempts: spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    priority: spec.priority ?? 100,
    waitForType: spec.waitForType ?? null,
  }
}

const PENDING = sql`('queued', 'failed')`

/**
 * `replace` types: mark the subject's pending job superseded before the new
 * one is inserted — unless it IS the new one (same idempotency key), which
 * the insert then skips.
 */
async function supersedePending(values: readonly JobValues[], now: Date, client: DbClient): Promise<void> {
  if (values.length === 0) return
  const rows = sql.join(
    values.map((v) => sql`(${v.type}::text, ${v.coalesceKey}::text, ${v.idempotencyKey}::text)`),
    sql`, `,
  )
  const ts = now.toISOString()
  await client.execute(sql`
    with v(type, ck, ik) as (values ${rows})
    update queue_jobs j
    set status = 'superseded',
        finished_at = ${ts}::timestamptz,
        updated_at = ${ts}::timestamptz,
        result = coalesce(j.result, '{}'::jsonb) || '{"superseded": true}'::jsonb
    where j.status in ${PENDING}
      and (j.type, j.coalesce_key) in (select type, ck from v)
      and not exists (select 1 from v where v.type = j.type and v.ck = j.coalesce_key and v.ik = j.idempotency_key)
  `)
}

/**
 * `merge` types: fold each spec into its subject's pending job (run_after and
 * priority pulled forward, never pushed back) and return the pending ids.
 */
async function mergeIntoPending(values: readonly JobValues[], now: Date, client: DbClient): Promise<string[]> {
  if (values.length === 0) return []
  const rows = sql.join(
    values.map((v) => sql`(${v.type}::text, ${v.coalesceKey}::text, ${v.runAfter.toISOString()}::timestamptz, ${v.priority}::int)`),
    sql`, `,
  )
  await client.execute(sql`
    with v(type, ck, run_after, priority) as (
      select type, ck, min(run_after), min(priority)
      from (values ${rows}) as x(type, ck, run_after, priority)
      group by type, ck
    )
    update queue_jobs j
    set run_after = least(j.run_after, v.run_after),
        priority = least(j.priority, v.priority),
        updated_at = ${now.toISOString()}::timestamptz
    from v
    where j.type = v.type and j.coalesce_key = v.ck and j.status in ${PENDING}
      and (j.run_after > v.run_after or j.priority > v.priority)
  `)
  const pairs = sql.join(values.map((v) => sql`(${v.type}::text, ${v.coalesceKey}::text)`), sql`, `)
  const result = await client.execute(sql`
    select id from queue_jobs
    where status in ${PENDING} and (type, coalesce_key) in (values ${pairs})
  `)
  return toRows<{ id: string }>(result).map((r) => r.id)
}

/**
 * Insert many jobs in one statement. Idempotent: a job whose (type,
 * idempotency key) exists is skipped (ON CONFLICT DO NOTHING), and at most
 * one job per subject is pending (lib/queue/coalesce.ts): a `replace` type
 * supersedes the stale pending job first, a `merge` type folds into it.
 */
export async function enqueueMany(
  specs: readonly EnqueueSpec[],
  client: DbClient = db,
): Promise<EnqueueResult> {
  if (specs.length === 0) return { created: 0, ids: [], pending: [] }
  const now = new Date()
  const values = specs.map(toValues)
  const byMode = (mode: CoalesceMode) => values.filter((v) => v.coalesceKey !== null && coalesceMode(v.type) === mode)
  await supersedePending(byMode('replace'), now, client)
  // No conflict target: skips a duplicate idempotency key AND a second pending job per subject.
  const rows = await client.insert(queueJobs).values(values).onConflictDoNothing().returning()
  const pending = await mergeIntoPending(byMode('merge'), now, client)
  return { created: rows.length, ids: rows.map((r) => r.id), pending }
}

/**
 * Add one job. Returns its id, or null when a job with the same
 * (type, idempotencyKey) already exists — in any status — or, for a `merge`
 * type, when it was folded into its subject's pending job.
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
  waited_out?: boolean | string | null
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
    ...(r.waited_out === true || r.waited_out === 't' ? { waitedOut: true } : {}),
  }
}

export interface ClaimOptions {
  /** Only this user's jobs (visit / "Run now" drains). */
  userId?: string
  types?: readonly string[]
  /** Only these jobs (e.g. the poll of the source just added). */
  jobIds?: readonly string[]
  /** Skip these types (their minimum budget no longer fits the drain). */
  excludeTypes?: readonly string[]
  /** Skip these users' jobs (their drain time slice is spent). */
  excludeUserIds?: readonly string[]
  now?: Date
  lockMs?: number
}

/**
 * A job with `wait_for_type` waits at most this long past its run_after for
 * its dependencies; then it runs anyway (and the drain logs a warning). The
 * daily chain is planned ~09:00 UTC, so it still runs in the 21:00 drain
 * when some of the day's polls never finished.
 */
export const WAIT_FOR_MAX_MS = 10 * 60 * 60 * 1000

/**
 * The unfinished `wait_for_type` jobs that hold back job `c`: same user,
 * queued on c's UTC day or later (the daily plan inserts a day's polls and
 * its chain in one statement). A dependency left over from an earlier day —
 * a stale poll in a backlog, even one retrying today — never blocks today's
 * chain.
 */
function pendingDependency(c: SQL): SQL {
  return sql`exists (
    select 1 from queue_jobs d
    where d.type = ${c}.wait_for_type
      and d.user_id is not distinct from ${c}.user_id
      and d.status in ('queued', 'failed', 'running')
      and d.created_at >= date_trunc('day', ${c}.created_at at time zone 'UTC') at time zone 'UTC'
  )`
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
 * unfinished job of its `wait_for_type` for the same user from the same UTC
 * day (pendingDependency), for at most WAIT_FOR_MAX_MS. A dependency that is
 * `done`, `dead` or `superseded` no longer blocks: like the old sync-all,
 * the discovery email still goes out when a source poll gave up. Claiming
 * counts as an attempt, so a job that keeps killing its worker still runs out.
 *
 * Fair order (lib/queue/capacity.ts): by priority, then ROUND-ROBIN across
 * users — every user's first due job of a priority before anyone's second
 * (`user_rank`, a row_number per user) — then, for source polls, the
 * STALEST SOURCE first (never polled, then the oldest last_polled_at; not
 * the oldest job, so a new source is polled at the next drain), then
 * run_after. Early-created accounts no longer drain first and starve the rest.
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
  if (opts.excludeTypes && opts.excludeTypes.length > 0) {
    filters.push(sql`and c.type not in (${sql.join(opts.excludeTypes.map((t) => sql`${t}`), sql`, `)})`)
  }
  if (opts.jobIds) {
    if (opts.jobIds.length === 0) return []
    filters.push(sql`and c.id in (${sql.join(opts.jobIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
  }
  if (opts.excludeUserIds && opts.excludeUserIds.length > 0) {
    filters.push(
      sql`and (c.user_id is null or c.user_id not in (${sql.join(opts.excludeUserIds.map((u) => sql`${u}::uuid`), sql`, `)}))`,
    )
  }
  const ts = now.toISOString()
  const waitedSince = new Date(now.getTime() - WAIT_FOR_MAX_MS).toISOString()
  const result = await client.execute(sql`
    update queue_jobs j
    set status = 'running',
        attempts = j.attempts + 1,
        locked_by = ${workerId},
        locked_until = ${lockUntil.toISOString()}::timestamptz,
        started_at = ${ts}::timestamptz,
        duration_ms = null,
        updated_at = ${ts}::timestamptz
    where j.id in (
      select c.id from queue_jobs c
      join (
        select x.id, p.stale,
               row_number() over (partition by x.user_id, x.priority order by p.stale nulls last, x.run_after, x.created_at) as user_rank
        from queue_jobs x
        cross join lateral (
          select case when x.type = ${JOB_TYPES.discoverySource} then coalesce(
            (select s.last_polled_at from sources s where s.id::text = x.payload->>'sourceId'),
            '-infinity'::timestamptz
          ) end as stale
        ) p
        where x.status in ('queued', 'failed')
          and x.run_after <= ${ts}::timestamptz
      ) r on r.id = c.id
      where c.status in ('queued', 'failed')
        and c.run_after <= ${ts}::timestamptz
        ${sql.join(filters, sql` `)}
        and (c.wait_for_type is null
             or c.run_after <= ${waitedSince}::timestamptz
             or not ${pendingDependency(sql`c`)})
      order by c.priority, r.user_rank, r.stale nulls last, c.run_after, c.created_at
      for update of c skip locked
      limit ${limit}
    )
    returning j.id, j.user_id, j.type, j.payload, j.attempts, j.max_attempts, j.priority, j.created_at,
              (j.wait_for_type is not null and ${pendingDependency(sql`j`)}) as waited_out
  `)
  return toRows<RawJob>(result)
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    .map(toClaimed)
}

/** Whether a due job of these types exists (in the claim's user / job scope). */
export async function hasDueJobs(
  opts: Pick<ClaimOptions, 'userId' | 'jobIds' | 'now'> & { types: readonly string[] },
  client: DbClient = db,
): Promise<boolean> {
  if (opts.types.length === 0 || (opts.jobIds && opts.jobIds.length === 0)) return false
  const now = (opts.now ?? new Date()).toISOString()
  const result = await client.execute(sql`
    select exists (
      select 1 from queue_jobs c
      where c.status in ('queued', 'failed') and c.run_after <= ${now}::timestamptz
        and c.type in (${sql.join(opts.types.map((t) => sql`${t}`), sql`, `)})
        ${opts.userId ? sql`and c.user_id = ${opts.userId}` : sql``}
        ${opts.jobIds ? sql`and c.id in (${sql.join(opts.jobIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``}
    ) as due
  `)
  const v = toRows<{ due: boolean | string }>(result)[0]?.due
  return v === true || v === 't'
}

function ownedBy(jobId: string, workerId: string): SQL | undefined {
  return and(eq(queueJobs.id, jobId), eq(queueJobs.lockedBy, workerId), eq(queueJobs.status, 'running'))
}

/**
 * `result.errors` with one more failed attempt appended, newest
 * MAX_ATTEMPT_ERRORS kept (one SQL expression, no read-back).
 */
function appendAttemptError(attempt: SQL, at: Date, message: string): SQL {
  const entry = sql`jsonb_build_array(jsonb_build_object('attempt', ${attempt}, 'at', ${at.toISOString()}::text, 'message', ${message}::text))`
  return sql`jsonb_build_object('errors', coalesce((
    select jsonb_agg(x.e order by x.i) from (
      select t.e, t.i from jsonb_array_elements(coalesce(${queueJobs.result}->'errors', '[]'::jsonb) || ${entry})
        with ordinality as t(e, i)
      order by t.i desc limit ${MAX_ATTEMPT_ERRORS}
    ) x
  ), '[]'::jsonb))`
}

export interface CompleteRun {
  /** Wall time of this attempt's handler. */
  durationMs?: number
  /** The handler's typed summary (capped before it is stored). */
  summary?: JobSummary
}

/**
 * Mark a claimed job done and store its run record: duration, summary, and
 * the errors of any earlier failed attempts. Returns false when the worker
 * no longer owns it (its lock expired and another drain recovered it) —
 * nothing is written.
 */
export async function complete(
  jobId: string,
  workerId: string,
  now: Date = new Date(),
  run: CompleteRun = {},
  client: DbClient = db,
): Promise<boolean> {
  const summary = capSummary(run.summary)
  const rows = await client
    .update(queueJobs)
    .set({
      status: 'done',
      finishedAt: now,
      updatedAt: now,
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
      durationMs: run.durationMs === undefined ? null : Math.max(0, Math.round(run.durationMs)),
      result: sql`jsonb_build_object(
        'summary', ${summary === null ? null : JSON.stringify(summary)}::jsonb,
        'errors', coalesce(${queueJobs.result}->'errors', '[]'::jsonb)
      )`,
    })
    .where(ownedBy(jobId, workerId))
    .returning()
  return rows.length > 0
}

/**
 * The row (columns given) has another pending job for its subject
 * (lib/queue/coalesce.ts). Turning it back into a pending job would break
 * the one-pending-per-subject index, and the other job does the work anyway.
 */
function pendingSibling(type: SQL, key: SQL, id: SQL): SQL {
  return sql`(${key} is not null and exists (
    select 1 from queue_jobs o
    where o.type = ${type} and o.coalesce_key = ${key} and o.id <> ${id} and o.status in ('queued', 'failed')
  ))`
}

// Explicitly qualified: inside the subquery an unqualified column would be o's.
const SIBLING = pendingSibling(sql`"queue_jobs"."type"`, sql`"queue_jobs"."coalesce_key"`, sql`"queue_jobs"."id"`)

/**
 * Hand a claimed job back untouched — not enough drain budget left to start
 * it. The claim's attempt is refunded so budget pressure never kills a job.
 * When a newer job for the same subject is pending meanwhile, this one is
 * superseded instead.
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
      status: sql`case when ${SIBLING} then 'superseded' else 'queued' end`,
      finishedAt: sql`case when ${SIBLING} then ${now.toISOString()}::timestamptz else null end`,
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
  /** Wall time of the failed attempt. */
  durationMs?: number
}

export interface FailOutcome {
  owned: boolean
  status: Extract<JobStatus, 'failed' | 'dead'>
  retryAt: Date | null
}

/**
 * Record a failed attempt. With attempts left the job becomes `failed` and
 * is retried after an exponential backoff with jitter — or `superseded` when
 * a newer job for the same subject is already pending; at max_attempts (or
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
  const message = sanitizeError(err)
  const ts = now.toISOString()
  const rows = await client
    .update(queueJobs)
    .set({
      status: dead ? 'dead' : sql`case when ${SIBLING} then 'superseded' else 'failed' end`,
      lastError: message,
      result: appendAttemptError(sql`${job.attempts}::int`, now, message),
      durationMs: opts.durationMs === undefined ? null : Math.max(0, Math.round(opts.durationMs)),
      updatedAt: now,
      lockedBy: null,
      lockedUntil: null,
      ...(dead
        ? { finishedAt: now }
        : { runAfter: retryAt as Date, finishedAt: sql`case when ${SIBLING} then ${ts}::timestamptz else null end` }),
    })
    .where(ownedBy(job.id, workerId))
    .returning()
  return { owned: rows.length > 0, status: dead ? 'dead' : 'failed', retryAt }
}

const STALE_MESSAGE = 'Stopped before finishing; will retry.'

/**
 * Stale lock recovery: running jobs whose lock expired (the worker died or
 * was frozen) go back to queued, or to dead once their attempts are spent —
 * or to superseded when their subject already has a pending job (or a newer
 * stale one being recovered). Returns the number of jobs recovered.
 */
export async function recoverStale(now: Date = new Date(), client: DbClient = db): Promise<number> {
  const ts = now.toISOString()
  const superseded = await client.execute(sql`
    update queue_jobs r
    set status = 'superseded',
        finished_at = ${ts}::timestamptz,
        locked_by = null,
        locked_until = null,
        last_error = ${STALE_MESSAGE},
        updated_at = ${ts}::timestamptz
    where r.status = 'running' and r.locked_until < ${ts}::timestamptz and r.attempts < r.max_attempts
      and r.coalesce_key is not null
      and exists (
        select 1 from queue_jobs o
        where o.type = r.type and o.coalesce_key = r.coalesce_key and o.id <> r.id
          and (o.status in ('queued', 'failed')
               or (o.status = 'running' and o.locked_until < ${ts}::timestamptz and o.attempts < o.max_attempts
                   and (o.created_at, o.id) > (r.created_at, r.id)))
      )
  `)
  const result = await client.execute(sql`
    update queue_jobs
    set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
        finished_at = case when attempts >= max_attempts then ${ts}::timestamptz else null end,
        run_after = ${ts}::timestamptz,
        locked_by = null,
        locked_until = null,
        last_error = ${STALE_MESSAGE},
        result = ${appendAttemptError(sql`attempts`, now, STALE_MESSAGE)},
        updated_at = ${ts}::timestamptz
    where status = 'running' and locked_until < ${ts}::timestamptz
  `)
  return affected(superseded) + affected(result)
}

/**
 * Owner-scoped retry of a dead job: back to queued with a fresh attempt
 * budget, due now. When its subject already has a pending job, that job
 * does the work and this one is marked superseded. Returns false when the
 * job is not this user's or not dead.
 */
export async function retryDead(
  userId: string,
  jobId: string,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .update(queueJobs)
    .set({
      status: sql`case when ${SIBLING} then 'superseded' else 'queued' end`,
      attempts: sql`case when ${SIBLING} then ${queueJobs.attempts} else 0 end`,
      runAfter: now,
      finishedAt: sql`case when ${SIBLING} then ${now.toISOString()}::timestamptz else null end`,
      updatedAt: now,
    })
    .where(and(eq(queueJobs.id, jobId), eq(queueJobs.userId, userId), eq(queueJobs.status, 'dead')))
    .returning()
  return rows.length > 0
}
