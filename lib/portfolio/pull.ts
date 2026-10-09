import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { refreshMatchesAfterSave } from '@/lib/discovery/match/enqueue'
import { logger } from '@/lib/logger'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { applyPortfolio } from './apply'
import type { SectionDiff } from './diff'
import { findOrphans, mergeOrphans, parseOrphans } from './overlay'
import { readPortfolioSource } from './source'
import { pullThrottleMs } from './sync-flags'

/**
 * SERVER-ONLY. Portfolio → lee: the portfolio's profile.json is the source
 * of the public facts, lee's master profile = the latest pull + the lee-only
 * overlay (lib/portfolio/overlay.ts).
 *
 * Runs when Settings › Profile / Résumé / Portfolio opens (throttled), from
 * "Sync now", and once a day in the queue. No per-section choice: every
 * section that differs is taken from the portfolio (reverse.ts keeps ids,
 * readiness, wordings and private items). A pull never publishes.
 */

export type PullTrigger = 'open' | 'manual' | 'daily'

export type PullOutcome =
  | { status: 'off' }
  | { status: 'throttled' }
  | { status: 'unchanged' }
  | { status: 'missing' }
  | { status: 'error'; error: string }
  | { status: 'pulled'; sections: number; orphaned: number; changed: boolean }

export interface PullOptions {
  trigger: PullTrigger
  now?: Date
  /** Skip the ~10-minute throttle (Sync now, the daily job). */
  ignoreThrottle?: boolean
  /** Re-apply even when the source sha is the one last pulled (Sync now). */
  reapply?: boolean
}

/** Diff entries kept for the "What changed in the last sync" panel. */
const MAX_DIFF_CHANGES = 20

function trimDiff(diff: readonly SectionDiff[]): SectionDiff[] {
  return diff.map((d) => ({ ...d, changes: d.changes.slice(0, MAX_DIFF_CHANGES) }))
}

function throttled(state: publishQ.PortfolioPublishRow | null, now: Date): boolean {
  const last = state?.pullCheckedAt
  return last !== null && last !== undefined && now.getTime() - last.getTime() < pullThrottleMs()
}

async function failed(userId: string, now: Date, error: string, trigger: PullTrigger): Promise<PullOutcome> {
  await publishQ.recordPullCheck(userId, { checkedAt: now, error })
  logger.warn('portfolio_pull_failed', { trigger })
  return { status: 'error', error }
}

export async function pullPortfolio(userId: string, opts: PullOptions): Promise<PullOutcome> {
  const now = opts.now ?? new Date()
  const state = await publishQ.get(userId)
  if (!opts.ignoreThrottle && throttled(state, now)) return { status: 'throttled' }

  const { profile, stored } = await getResumeProfile(userId)
  const source = await readPortfolioSource(userId, profile.portfolio.canonical, now)
  if (source.kind === 'off') return { status: 'off' }
  if (source.kind === 'error') return failed(userId, now, source.error, opts.trigger)
  if (source.kind === 'missing') {
    await publishQ.recordPullCheck(userId, { checkedAt: now, error: null })
    return { status: 'missing' }
  }
  if (!opts.reapply && state?.pulledSha === source.sha) {
    await publishQ.recordPullCheck(userId, { checkedAt: now, error: null })
    return { status: 'unchanged' }
  }

  const applied = applyPortfolio(profile, source.doc, { firstPull: !state?.pulledSha })
  const orphans = findOrphans(profile, applied.profile, now)
  const changed = !stored || applied.diff.length > 0 || applied.profile !== profile
  if (changed) {
    try {
      await saveResumeProfile(userId, applied.profile, { source: 'portfolio' })
    } catch (err) {
      if (!(err instanceof ResumeValidationError)) throw err
      return failed(userId, now, `lee could not store the portfolio’s profile.json: ${err.message}`, opts.trigger)
    }
  }
  await publishQ.recordPull(userId, {
    pulledSha: source.sha,
    pulledAt: now,
    source: source.via,
    diff: trimDiff(applied.diff),
    orphans: mergeOrphans(parseOrphans(state?.orphans), orphans),
  })
  // Match scores, best CV per posting and role suggestions read the profile.
  if (changed) await refreshMatchesAfterSave(userId)
  logger.info('portfolio_pull', {
    trigger: opts.trigger,
    source: source.via,
    sections: applied.diff.length,
    orphaned: orphans.length,
    changed,
  })
  return { status: 'pulled', sections: applied.diff.length, orphaned: orphans.length, changed }
}

/** On page open: throttled, never throws (the page renders whatever lee has). */
export async function pullOnOpen(userId: string): Promise<PullOutcome> {
  try {
    return await pullPortfolio(userId, { trigger: 'open' })
  } catch (err) {
    logger.warn('portfolio_pull_on_open_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { status: 'error', error: 'Could not sync from your portfolio.' }
  }
}

/** Remove orphaned overlay entries (all, or one by id). */
export async function clearOrphans(userId: string, id?: string): Promise<number> {
  const state = await publishQ.get(userId)
  const current = parseOrphans(state?.orphans)
  const next = id ? current.filter((o) => o.id !== id) : []
  if (state) await publishQ.setOrphans(userId, next)
  return current.length - next.length
}
