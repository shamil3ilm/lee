import type { DbClient } from '@/lib/db/client'
import * as settingsQ from '@/lib/db/queries/retentionSettings'
import { pastDeadline, type BatchOpts } from './batch'
import { compactDiscoveryPayloads, expireStaleDiscoveries, tombstoneDismissedDiscoveries } from './discoveries'
import { dropDriveDuplicatedBytes, evictPdfCache, pruneCvScores, pruneLabRuns } from './history'
import {
  pruneExpiredAuthRows,
  pruneOrphanDriveFolders,
  pruneOrphanRiskAssessments,
  pruneScamDomainCache,
  pruneUsageHistory,
} from './housekeeping'
import { pruneReputationCache } from './reputation'
import { pruneVariantVersions } from './variants'
import { pruneAiCallLogs, pruneProcessedGmailThreads, pruneQueueJobs, pruneSystemEvents, pruneWebVitals } from './logs'
import {
  EMPTY_GLOBAL_COUNTS,
  EMPTY_USER_COUNTS,
  addCounts,
  type GlobalCounts,
  type RetentionResult,
  type UserCounts,
} from './steps'
import type { RetentionPolicy } from './windows'

/**
 * Orchestration. The nightly cron (and the ≥90 % storage throttle) cleans
 * every user with their own windows, then runs the global steps once;
 * "Clean up now" does the same for one user. Steps run in sequence, each in
 * bounded batches, and stop starting new batches once the time budget is
 * spent, so a run always returns inside the function's limit. Every step is
 * idempotent, so an interrupted run simply continues the next night.
 */

// Vercel caps a function at 300 s; leave room for the response and logging.
export const CRON_BUDGET_MS = 240_000
// "Clean up now" runs inside the Settings page's 60 s function.
export const MANUAL_BUDGET_MS = 45_000

export interface RunOpts {
  budgetMs?: number
  batchSize?: number
  client?: DbClient
}

type StepOpts = Pick<BatchOpts, 'batchSize' | 'client' | 'deadline'>

/** Every per-user step for one user, with that user's windows. */
export async function runUserCleanup(
  userId: string,
  policy: RetentionPolicy,
  now: Date,
  opts: StepOpts = {},
): Promise<UserCounts> {
  const o = { ...opts, userId }
  return {
    ...EMPTY_USER_COUNTS,
    expiredDiscoveries: await expireStaleDiscoveries(now, { ...o, days: policy.staleDiscoveryDays }),
    tombstonedDiscoveries: await tombstoneDismissedDiscoveries(now, { ...o, days: policy.dismissedDiscoveryDays }),
    compactedDiscoveries: await compactDiscoveryPayloads(now, o),
    aiCallLogs: await pruneAiCallLogs(now, { ...o, days: policy.aiCallLogDays }),
    gmailThreads: await pruneProcessedGmailThreads(now, o),
    webVitals: await pruneWebVitals(now, { ...o, days: policy.webVitalsDays }),
    cvScores: await pruneCvScores(now, { ...o, days: policy.cvScoreDays }),
    labRuns: await pruneLabRuns(now, { ...o, days: policy.labRunDays }),
    pdfCache: await evictPdfCache(now, o),
    driveDuplicateBytes: await dropDriveDuplicatedBytes(o),
    orphanRiskAssessments: await pruneOrphanRiskAssessments(o),
    orphanDriveFolders: await pruneOrphanDriveFolders(o),
    reputationCache: await pruneReputationCache(now, o),
    variantVersions: await pruneVariantVersions(now, { ...o, days: policy.variantVersionDays }),
  }
}

/** Steps over rows that belong to no single user (or to deleted users). */
export async function runGlobalCleanup(now: Date, opts: StepOpts = {}): Promise<GlobalCounts> {
  return {
    ...EMPTY_GLOBAL_COUNTS,
    queueJobs: await pruneQueueJobs(now, opts),
    orphanAiCallLogs: await pruneAiCallLogs(now, { ...opts, userId: null }),
    expiredAuth: await pruneExpiredAuthRows(now, opts),
    usageHistory: await pruneUsageHistory(now, opts),
    scamDomains: await pruneScamDomainCache(now, opts),
    systemEvents: await pruneSystemEvents(now, opts),
  }
}

function stepOpts(opts: RunOpts, defaultBudgetMs: number): StepOpts {
  return {
    batchSize: opts.batchSize,
    client: opts.client,
    deadline: Date.now() + (opts.budgetMs ?? defaultBudgetMs),
  }
}

/**
 * Clean every user, then the global rows. Records each user's run (their
 * own counts plus the global ones) for Settings › Storage.
 */
export async function runRetention(
  now: Date = new Date(),
  opts: RunOpts & { trigger?: 'cron' | 'early' } = {},
): Promise<RetentionResult> {
  const so = stepOpts(opts, CRON_BUDGET_MS)
  const policies = await settingsQ.listPolicies(opts.client)
  const perUser: { userId: string; counts: UserCounts }[] = []
  for (const { userId, policy } of policies) {
    if (pastDeadline(so.deadline)) break
    perUser.push({ userId, counts: await runUserCleanup(userId, policy, now, so) })
  }
  const global = await runGlobalCleanup(now, so)
  for (const { userId, counts } of perUser) {
    await settingsQ.recordLastRun(userId, opts.trigger ?? 'cron', { ...counts, ...global }, now, opts.client)
  }
  const users = perUser.reduce<UserCounts>((acc, u) => addCounts(acc, u.counts), EMPTY_USER_COUNTS)
  return { ...users, ...global, users: perUser.length, complete: !pastDeadline(so.deadline) }
}

/** "Clean up now": the same cleanup for one user, plus the global steps. */
export async function runRetentionForUser(
  userId: string,
  now: Date = new Date(),
  opts: RunOpts = {},
): Promise<RetentionResult> {
  const so = stepOpts(opts, MANUAL_BUDGET_MS)
  const { policy } = await settingsQ.get(userId, opts.client)
  const counts = await runUserCleanup(userId, policy, now, so)
  const global = await runGlobalCleanup(now, so)
  await settingsQ.recordLastRun(userId, 'manual', { ...counts, ...global }, now, opts.client)
  return { ...counts, ...global, users: 1, complete: !pastDeadline(so.deadline) }
}
