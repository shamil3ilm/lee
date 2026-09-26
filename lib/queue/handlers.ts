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
import { reassessStaleDiscoveries } from '@/lib/scam/service'
import { JOB_TYPES } from './job-types'
import { createRegistry, defineHandler, type HandlerRegistry } from './registry'
import type { JobResult } from './types'

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
    return { metrics: { reminders_added: inserted } }
  },
})

const followups = defineHandler({
  type: JOB_TYPES.followups,
  scope: 'user',
  payload: USER_PAYLOAD,
  timeoutMs: 30_000,
  async run({ job }): Promise<JobResult> {
    return { metrics: { followups_recommended: await recordFollowupNudges(userId(job)) } }
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
      return { metrics: { gmail_checked: r.checked, gmail_matched: r.matched } }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) return { metrics: { gmail_skipped_no_account: 1 } }
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
    if (!profile?.weeklyDigestEnabled || !isMondayInTz(tz) || alreadySentThisTzWeek(profile, tz)) {
      return { metrics: { digests_sent: 0 } }
    }
    try {
      await sendWeeklyDigest({ userId: userId(job) })
      return { metrics: { digests_sent: 1 } }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) return { metrics: { digests_sent: 0 } }
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
  async run({ job, payload, deadline }) {
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
      }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) return { metrics: { discovery_emails_sent: 0 } }
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
    return { metrics: { scam_reassessed: await reassessStaleDiscoveries(userId(job)) } }
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
] as const

export const appRegistry: HandlerRegistry = createRegistry(appHandlers)
