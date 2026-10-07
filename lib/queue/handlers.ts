import { z } from 'zod'
import { getAIProviderForUser } from '@/lib/ai'
import * as profileQ from '@/lib/db/queries/profile'
import { alreadySentThisTzWeek, isMondayInTz, sendWeeklyDigest } from '@/lib/digest/weekly'
import { runDiscoveryForSource } from '@/lib/discovery/service'
import { recordFollowupNudges } from '@/lib/followups/service'
import { syncGmail } from '@/lib/gmail/sync'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { sendDiscoveryEmailIfEnabled } from '@/lib/notifications/discovery'
import { recordDueReminders } from '@/lib/reminders/service'
import { refreshCompanyReputation } from '@/lib/reputation/refresh'
import { reassessStaleDiscoveries } from '@/lib/scam/service'
import { reevaluateRelevance } from '@/lib/discovery/relevance/service'
import { enqueueRelevanceJob } from '@/lib/discovery/relevance/enqueue'
import { takeUsageSnapshot } from '@/lib/usage/snapshot'
import { buildShortlistForUser } from '@/lib/apply/shortlist'
import { isThrottled } from '@/lib/usage/throttle'
import { JOB_TYPES } from './job-types'
import { createRegistry, defineHandler, type HandlerRegistry } from './registry'
import type { DigestSkipReason, DiscoverySourceSummary } from './run-summary'
import type { JobResult } from './types'

function emptySourceSummary(source: string): DiscoverySourceSummary {
  return {
    kind: 'discovery-source',
    source,
    status: 'skipped',
    fetched: 0,
    new: 0,
    scored: 0,
    quarantined: 0,
    skipped: 0,
    errors: 0,
  }
}

/**
 * The sync-all steps as small, idempotent jobs. Each handler is the same
 * call the old cron made, with the same guards:
 * - reminders: at most one reminder per application per UTC day (SQL);
 * - follow-ups: apps nudged in the last 24 h are skipped;
 * - Gmail: processed threads are recorded, so a re-run matches nothing new;
 * - digest: Monday in the user's timezone, once per week (digestLastSentAt);
 * - discovery email: only matches newer than the last send.
 * A user without a Google account is a normal skip, not a failure.
 */

const noPayload = z.object({}).passthrough()
const USER_PAYLOAD = noPayload

/** Leave the cooperative deadline this far before the hard timeout. */
const DISCOVERY_DEADLINE_MARGIN_MS = 10_000

function userId(job: { userId: string | null }): string {
  // defineHandler rejects user-scoped jobs without a user before run().
  return job.userId as string
}

const reminders = defineHandler({
  type: JOB_TYPES.reminders,
  scope: 'global',
  payload: noPayload,
  timeoutMs: 30_000,
  async run() {
    const { inserted } = await recordDueReminders()
    return { metrics: { reminders_added: inserted }, summary: { kind: 'reminders', added: inserted } }
  },
})

const followups = defineHandler({
  type: JOB_TYPES.followups,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 30_000,
  async run({ job }): Promise<JobResult> {
    const nudged = await recordFollowupNudges(userId(job))
    return { metrics: { followups_recommended: nudged }, summary: { kind: 'followups', nudged } }
  },
})

const gmailSync = defineHandler({
  type: JOB_TYPES.gmailSync,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 60_000,
  async run({ job }): Promise<JobResult> {
    try {
      const r = await syncGmail({ userId: userId(job) })
      return {
        metrics: { gmail_checked: r.checked, gmail_matched: r.matched },
        summary: { kind: 'gmail-sync', checked: r.checked, matched: r.matched, logged: r.logged },
      }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) {
        return { metrics: { gmail_skipped_no_account: 1 }, summary: { kind: 'gmail-sync', skipped: 'no_google_account' } }
      }
      throw e
    }
  },
})

const digest = defineHandler({
  type: JOB_TYPES.digest,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 45_000,
  async run({ job }): Promise<JobResult> {
    const profile = await profileQ.get(userId(job))
    const tz = profile?.timezone
    const skip = (reason: DigestSkipReason): JobResult => ({
      metrics: { digests_sent: 0 },
      summary: { kind: 'digest', sent: false, reason },
    })
    if (!profile?.weeklyDigestEnabled) return skip('disabled')
    if (!isMondayInTz(tz)) return skip('not_monday')
    if (alreadySentThisTzWeek(profile, tz)) return skip('already_sent')
    try {
      await sendWeeklyDigest({ userId: userId(job) })
      return { metrics: { digests_sent: 1 }, summary: { kind: 'digest', sent: true } }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) return skip('no_google_account')
      throw e
    }
  },
})

const discoverySource = defineHandler({
  type: JOB_TYPES.discoverySource,
  scope: 'user',
  payload: z.object({ sourceId: z.string().uuid() }),
  timeoutMs: 120_000,
  minBudgetMs: 20_000,
  async run({ job, payload, deadline }): Promise<JobResult> {
    // Free-tier throttle: at ≥90% Neon compute/egress a source is polled at
    // most once a day — a retry (attempt 2+) is skipped, not re-polled.
    if (job.attempts > 1 && (await isThrottled('pause_nonessential'))) {
      return {
        metrics: { discovery_paused_by_usage: 1 },
        summary: { ...emptySourceSummary('Source'), status: 'paused' },
      }
    }
    const ai = await getAIProviderForUser(userId(job))
    const r = await runDiscoveryForSource({
      userId: userId(job),
      sourceId: payload.sourceId,
      ai,
      deadline: Math.max(Date.now(), deadline - DISCOVERY_DEADLINE_MARGIN_MS),
    })
    // Out of time before the poll even started: retry on a later drain
    // instead of losing the source for the day (the old cron's behaviour).
    if (r.status === 'skipped' && r.budgetExhausted) throw new Error('Out of time before polling; will retry.')
    return {
      metrics: {
        sources_polled: r.status === 'polled' ? 1 : 0,
        new_discoveries: r.newJobDiscoveries + r.newCompanyDiscoveries,
        discovery_budget_exhausted: r.budgetExhausted ? 1 : 0,
      },
      warnings: r.error ? [`source ${payload.sourceId}: ${r.error}`] : [],
      summary: {
        ...emptySourceSummary(r.sourceName ?? 'Removed source'),
        ...(r.stats ?? {}),
        status: r.status,
        errors: r.error ? 1 : 0,
        ...(r.budgetExhausted ? { budgetExhausted: true } : {}),
      },
    }
  },
})

const discoveryEmail = defineHandler({
  type: JOB_TYPES.discoveryEmail,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 45_000,
  async run({ job }): Promise<JobResult> {
    try {
      const r = await sendDiscoveryEmailIfEnabled({ userId: userId(job) })
      return {
        metrics: { discovery_emails_sent: r.sent ? 1 : 0, discovery_matches_notified: r.sent ? r.count : 0 },
        summary: r.sent
          ? { kind: 'discovery-email', sent: true, count: r.count }
          : { kind: 'discovery-email', sent: false, reason: r.reason ?? 'no_matches' },
      }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) {
        return {
          metrics: { discovery_emails_sent: 0 },
          summary: { kind: 'discovery-email', sent: false, reason: 'no_google_account' },
        }
      }
      throw e
    }
  },
})

const scamReassess = defineHandler({
  type: JOB_TYPES.scamReassess,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 45_000,
  async run({ job }): Promise<JobResult> {
    // Non-essential: skipped while the free-tier throttle is on.
    if (await isThrottled('pause_nonessential')) {
      return {
        metrics: { scam_reassess_paused_by_usage: 1 },
        summary: { kind: 'scam-reassess', reassessed: 0, paused: true },
      }
    }
    const reassessed = await reassessStaleDiscoveries(userId(job))
    return { metrics: { scam_reassessed: reassessed }, summary: { kind: 'scam-reassess', reassessed } }
  },
})

/**
 * Re-gate the user's discoveries under their current search preferences
 * (queued on every preferences save). Batched and time-boxed; when rows
 * remain at the deadline a follow-up job is queued, so a large inbox is
 * finished over several drains. Idempotent: rows already under the current
 * key are skipped.
 */
const discoveryRelevance = defineHandler({
  type: JOB_TYPES.discoveryRelevance,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 60_000,
  async run({ job, deadline }): Promise<JobResult> {
    const r = await reevaluateRelevance(userId(job), { deadline: Math.min(deadline, Date.now() + 50_000) })
    if (r.remaining) await enqueueRelevanceJob(userId(job))
    return {
      metrics: {
        relevance_evaluated: r.evaluated,
        relevance_filtered: r.filtered,
        relevance_continued: r.remaining ? 1 : 0,
      },
    }
  },
})

const usageSnapshot = defineHandler({
  type: JOB_TYPES.usageSnapshot,
  scope: 'global',
  payload: noPayload,
  timeoutMs: 60_000,
  async run(): Promise<JobResult> {
    const r = await takeUsageSnapshot()
    return {
      metrics: {
        usage_snapshots: 1,
        usage_todos_created: r.todosCreated,
        usage_throttles: r.throttles.length,
      },
      summary: { kind: 'usage-snapshot', throttles: [...r.throttles], todosCreated: r.todosCreated },
    }
  },
})

const companyReputation = defineHandler({
  type: JOB_TYPES.companyReputation,
  scope: 'user',
  payload: z.object({ companyId: z.string().uuid(), trigger: z.enum(['weekly', 'manual']).default('weekly') }),
  // Three sources in sequence; GDELT's 5 s spacing can add a wait.
  timeoutMs: 60_000,
  minBudgetMs: 15_000,
  async run({ job, payload }): Promise<JobResult> {
    // The weekly refresh is non-essential; a refresh the user asked for runs.
    if (payload.trigger === 'weekly' && (await isThrottled('pause_nonessential'))) {
      return { metrics: { reputation_paused_by_usage: 1 } }
    }
    const r = await refreshCompanyReputation(userId(job), payload.companyId)
    return {
      metrics: {
        reputation_refreshed: r.status === 'refreshed' ? 1 : 0,
        reputation_signals: r.signals,
        reputation_source_errors: r.errors.length,
      },
      warnings: r.errors.map((e) => `company ${payload.companyId}: ${e}`),
    }
  },
})

/**
 * The daily shortlist (lib/apply/shortlist.ts): ranks the user's new and
 * recent discoveries after the polls and the Scam Shield re-check, and
 * stores the top N for the shortlist page. DB-only, no AI; a rerun replaces
 * only the entries the user has not acted on.
 */
const shortlist = defineHandler({
  type: JOB_TYPES.shortlist,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 30_000,
  async run({ job }): Promise<JobResult> {
    const r = await buildShortlistForUser(userId(job))
    return {
      metrics: { shortlist_candidates: r.candidates, shortlisted: r.shortlisted },
      summary: { kind: 'shortlist', candidates: r.candidates, shortlisted: r.shortlisted },
    }
  },
})

export const appHandlers = [
  reminders,
  followups,
  gmailSync,
  digest,
  discoverySource,
  discoveryEmail,
  scamReassess,
  discoveryRelevance,
  usageSnapshot,
  companyReputation,
  shortlist,
] as const

export const appRegistry: HandlerRegistry = createRegistry(appHandlers)
