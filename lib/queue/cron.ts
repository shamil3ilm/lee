import { env } from '@/lib/env'
import { isBearerAuthorized } from '@/lib/auth/secret-compare'
import { DRAIN_BUDGET_MS, DRAIN_LANES } from './capacity'
import { drain, type DrainOptions, type DrainResult } from './drain'

/**
 * Budget of a cron-triggered drain. The function may live 300 s (Vercel
 * Hobby with Fluid compute); every job's timeout is capped at the budget
 * left, so the drain is over by ~240 s with a minute of headroom.
 */
export const CRON_DRAIN_BUDGET_MS = DRAIN_BUDGET_MS
/**
 * Jobs in flight at once. Polls are network-bound and each invitee's AI
 * calls use their own key, so three lanes fit Neon and the providers; the
 * daily plan (lib/queue/capacity.ts) is sized for exactly this.
 */
export const CRON_DRAIN_CONCURRENCY = DRAIN_LANES

/** Constant-time check of Vercel's `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(req: Request): boolean {
  return isBearerAuthorized(req.headers.get('authorization'), env.CRON_SECRET)
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
