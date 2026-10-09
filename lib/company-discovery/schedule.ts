import { isoWeek } from '@/lib/reputation/schedule'
import { COMPANY_ENRICH_BATCHES, JOB_PRIORITY, JOB_TYPES, jobKeys, utcDay } from '@/lib/queue/job-types'
import { enqueueMany, type EnqueueSpec } from '@/lib/queue/queue'

/**
 * SERVER-ONLY. Company discovery in the queue: one weekly run per user
 * (idempotent per ISO week; the daily scheduler plans it every day and only
 * the first insert of the week lands), an on-demand run at most once a day,
 * and enrichment in numbered batches, at most COMPANY_ENRICH_BATCHES a week.
 */

export function weeklyCompanySpec(userId: string, now: Date): EnqueueSpec {
  return {
    type: JOB_TYPES.companyDiscovery,
    userId,
    runAfter: now,
    payload: { trigger: 'weekly' },
    idempotencyKey: jobKeys.companyDiscovery(userId, isoWeek(now)),
    priority: JOB_PRIORITY[JOB_TYPES.companyDiscovery],
    maxAttempts: 2,
  }
}

/** "Find companies now": at most once per UTC day. Returns false when today's run is already queued. */
export async function enqueueCompanyDiscoveryNow(userId: string, now: Date = new Date()): Promise<boolean> {
  const { created } = await enqueueMany([
    {
      ...weeklyCompanySpec(userId, now),
      payload: { trigger: 'manual' },
      idempotencyKey: jobKeys.companyDiscoveryManual(userId, utcDay(now)),
      priority: JOB_PRIORITY[JOB_TYPES.companyReputation],
    },
  ])
  return created > 0
}

/** Queue the next enrichment batch of the week; false when the week's batches are used up. */
export async function enqueueEnrichment(userId: string, now: Date = new Date()): Promise<boolean> {
  const week = isoWeek(now)
  for (let n = 0; n < COMPANY_ENRICH_BATCHES; n++) {
    const { created } = await enqueueMany([
      {
        type: JOB_TYPES.companyEnrich,
        userId,
        runAfter: now,
        idempotencyKey: jobKeys.companyEnrich(userId, week, n),
        priority: JOB_PRIORITY[JOB_TYPES.companyEnrich],
        maxAttempts: 2,
      },
    ])
    if (created > 0) return true
  }
  return false
}
