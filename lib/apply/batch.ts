import * as appsQ from '@/lib/db/queries/applications'
import * as profileQ from '@/lib/db/queries/profile'
import type { AIProvider } from '@/lib/ai/types'
import { AISkippedError } from '@/lib/ai/signal'
import { quotaMeters } from '@/lib/ai/quota'
import { isThrottled } from '@/lib/usage/throttle'
import { readProfileLinks, suggestLinksForJob } from '@/lib/profile/links'
import { variantSummaries } from '@/lib/variants/service'
import { jobSignals, suggestVariant } from '@/lib/variants/suggest'
import { logger } from '@/lib/logger'
import { confirmVariant, coverStep, startPrepare, tailorStep } from './prepare'
import { MAX_BATCH } from './batch-limits'

/**
 * Batch prepare: up to MAX_BATCH shortlisted postings in one go — create the
 * application, take the suggested variant, then the tailored CV and the
 * cover letter (with the suggested links). The AI budget is respected: the
 * existing signal gates refuse thin inputs per item (AISkippedError), and
 * the AI steps stop for the rest of the batch when the usage throttle is on
 * or a model's daily quota is critical. Items left unfinished resume in the
 * normal step panel. Nothing is sent.
 */

export { MAX_BATCH }

export type BatchItemStatus = 'prepared' | 'partial' | 'failed'

export interface BatchItem {
  discoveryId: string
  applicationId: string | null
  status: BatchItemStatus
  message: string | null
}

/** Why AI steps should not run now, or null when the budget allows them. */
export async function aiBudgetBlock(userId: string): Promise<string | null> {
  if (await isThrottled('pause_nonessential')) return 'AI steps paused: free-tier usage is high this month.'
  const meters = await quotaMeters(userId).catch(() => [])
  if (meters.some((m) => m.level === 'critical' || m.level === 'exhausted')) {
    return 'AI steps paused: today’s AI quota is nearly used up.'
  }
  return null
}

async function suggestedVariantId(userId: string, app: NonNullable<Awaited<ReturnType<typeof appsQ.getById>>>): Promise<string | null> {
  const variants = await variantSummaries(userId)
  const signals = jobSignals({ title: app.job.title, location: app.job.location, remoteType: app.job.remoteType, descriptionMd: app.job.descriptionMd })
  return suggestVariant(variants, signals).variant?.id ?? null
}

async function suggestedLinkIds(userId: string, app: NonNullable<Awaited<ReturnType<typeof appsQ.getById>>>): Promise<string[]> {
  const links = readProfileLinks((await profileQ.get(userId))?.links)
  return suggestLinksForJob(links, { title: app.job.title, description: app.job.descriptionMd })
    .filter((s) => s.suggested)
    .map((s) => s.link.id)
}

async function prepareOne(
  userId: string,
  discoveryId: string,
  ai: AIProvider,
  blocked: string | null,
  deadline: number,
): Promise<BatchItem> {
  const { applicationId } = await startPrepare(userId, { discoveryId })
  const app = await appsQ.getById(userId, applicationId)
  if (!app) return { discoveryId, applicationId, status: 'failed', message: 'Application not found.' }
  await confirmVariant(userId, applicationId, await suggestedVariantId(userId, app))
  if (blocked) return { discoveryId, applicationId, status: 'partial', message: blocked }
  try {
    if (Date.now() >= deadline) return { discoveryId, applicationId, status: 'partial', message: 'Out of time; continue in the step panel.' }
    await tailorStep(userId, applicationId, ai)
    if (Date.now() >= deadline) return { discoveryId, applicationId, status: 'partial', message: 'Out of time; continue in the step panel.' }
    await coverStep(userId, applicationId, ai, await suggestedLinkIds(userId, app))
    return { discoveryId, applicationId, status: 'prepared', message: null }
  } catch (err) {
    if (err instanceof AISkippedError) return { discoveryId, applicationId, status: 'partial', message: err.message }
    throw err
  }
}

export async function prepareBatch(
  userId: string,
  discoveryIds: readonly string[],
  opts: { ai: AIProvider; deadline: number },
): Promise<BatchItem[]> {
  const ids = [...new Set(discoveryIds)].slice(0, MAX_BATCH)
  const out: BatchItem[] = []
  let blocked = await aiBudgetBlock(userId)
  for (const discoveryId of ids) {
    try {
      out.push(await prepareOne(userId, discoveryId, opts.ai, blocked, opts.deadline))
    } catch (err) {
      logger.warn('prepare_batch_item_failed', { err: err instanceof Error ? err.message : String(err) })
      out.push({ discoveryId, applicationId: null, status: 'failed', message: 'Could not prepare this one.' })
    }
    // Re-check after each item's AI calls so the batch stops at the limit.
    if (!blocked) blocked = await aiBudgetBlock(userId)
  }
  return out
}
