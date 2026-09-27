import { sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'

/**
 * Shared plumbing for the retention steps: cutoffs, affected-row counts and
 * bounded batching with an optional wall-clock deadline, so one run never
 * holds a long lock or outlives the function's time limit.
 */

export const RETENTION_BATCH_SIZE = 5_000
// Upper bound on batches per step per run (≈ 250k rows) — a safety valve,
// not an expected limit.
const MAX_BATCHES = 50

export const DAY_MS = 24 * 60 * 60 * 1000

export interface BatchOpts {
  batchSize?: number
  client?: DbClient
  /**
   * Only this user's rows. `undefined` = every user; `null` = rows whose
   * user was deleted (nullable user_id columns only).
   */
  userId?: string | null
  /** Epoch ms: no new batch starts at or after this instant. */
  deadline?: number
}

export function clientOf(opts: BatchOpts): DbClient {
  return opts.client ?? db
}

export function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

export function affected(result: unknown): number {
  // postgres-js returns an array with `count`; PGlite returns { affectedRows }.
  const r = result as { count?: number; affectedRows?: number; rowCount?: number }
  return Number(r.count ?? r.affectedRows ?? r.rowCount ?? 0)
}

/** ` and <column> = <userId>` (or `is null`), empty when unscoped. */
export function userScope(column: SQL, userId: string | null | undefined): SQL {
  if (userId === undefined) return sql``
  if (userId === null) return sql` and ${column} is null`
  return sql` and ${column} = ${userId}::uuid`
}

export function pastDeadline(deadline: number | undefined): boolean {
  return deadline !== undefined && Date.now() >= deadline
}

/**
 * Run `run(limit)` until it changes fewer than `limit` rows, MAX_BATCHES is
 * reached or the deadline passes. Returns the total rows changed.
 */
export async function inBatches(
  run: (limit: number) => Promise<number>,
  opts: Pick<BatchOpts, 'batchSize' | 'deadline'>,
): Promise<number> {
  const batchSize = opts.batchSize ?? RETENTION_BATCH_SIZE
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    if (pastDeadline(opts.deadline)) break
    const n = await run(batchSize)
    total += n
    if (n < batchSize) break
  }
  return total
}

/** One bounded statement, skipped when the deadline has passed. */
export async function once(run: () => Promise<number>, deadline: number | undefined): Promise<number> {
  return pastDeadline(deadline) ? 0 : run()
}
