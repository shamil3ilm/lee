import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { drain, type DrainOptions, type DrainResult } from './drain'

/**
 * Budget of a cron-triggered drain. The function may live 300 s (Vercel
 * Hobby with Fluid compute); every job's timeout is capped at the budget
 * left, so the drain is over by ~240 s with a minute of headroom.
 */
export const CRON_DRAIN_BUDGET_MS = 240_000
/** Jobs in flight at once — keeps Neon connections and AI rate limits calm. */
export const CRON_DRAIN_CONCURRENCY = 2

/** Constant-time check of Vercel's `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(req: Request): boolean {
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function cronDrain(opts: Partial<DrainOptions> = {}): Promise<DrainResult> {
  return drain({ budgetMs: CRON_DRAIN_BUDGET_MS, concurrency: CRON_DRAIN_CONCURRENCY, ...opts })
}

export interface DrainSummary {
  claimed: number
  done: number
  failed: number
  dead: number
  recovered: number
  stoppedBy: DrainResult['stoppedBy']
  durationMs: number
  metrics: Record<string, number>
  errorCount: number
}

/** Response body for cron / worker drains: counts only, no job internals. */
export function summarizeDrain(r: DrainResult): DrainSummary {
  return {
    claimed: r.claimed,
    done: r.done,
    failed: r.failed,
    dead: r.dead,
    recovered: r.recovered,
    stoppedBy: r.stoppedBy,
    durationMs: r.durationMs,
    metrics: r.metrics,
    errorCount: r.errors.length,
  }
}
