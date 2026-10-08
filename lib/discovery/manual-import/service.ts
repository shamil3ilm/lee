import type { AIProvider } from '@/lib/ai/types'
import * as sourcesQ from '@/lib/db/queries/sources'
import { findPossibleDuplicates } from '@/lib/db/queries/discoveryDedupe'
import type { Source } from '@/lib/db/queries/sources'
import { getAdapter } from '@/lib/discovery/adapters'
import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { ingestItemsForSource } from '@/lib/discovery/service'
import { matchWatchEmployer, watchTags } from '@/lib/discovery/ai-mode/employer-watch'
import { logger } from '@/lib/logger'
import { dropDuplicates, keysOf } from './dedupe'
import { enrichCandidates } from './enrich'
import { canonicalUrl } from './urls'
import type { ImportCandidate, ImportSummary } from './types'

/**
 * "Add from text or link": the openings the user ticked become discoveries
 * of their `manual_import` source, through the normal pipeline (relevance
 * gate, Scam Shield, scoring). The source is created on first use, switched
 * off (it has nothing to poll).
 */

export const MANUAL_IMPORT_KIND = 'manual_import'
export const MANUAL_IMPORT_SOURCE_NAME = 'Added by you'
/** Leave room under the action's time limit for the ingest itself. */
const IMPORT_BUDGET_MS = 40_000

export async function ensureManualImportSource(userId: string): Promise<Source> {
  const all = await sourcesQ.list(userId)
  const existing = all.find((s) => s.kind === MANUAL_IMPORT_KIND)
  if (existing) return existing
  return sourcesQ.create(userId, { name: MANUAL_IMPORT_SOURCE_NAME, kind: MANUAL_IMPORT_KIND, config: {}, enabled: false })
}

function withWatchTags(item: DiscoveryItem): DiscoveryItem {
  const job = item.normalized as NormalizedJob
  const tags = watchTags(matchWatchEmployer(job.applyUrl, job.companyName))
  if (tags.length === 0) return item
  return { ...item, normalized: { ...job, tags: [...new Set([...(job.tags ?? []), ...tags])] } }
}

export async function importOpenings(args: {
  userId: string
  candidates: readonly ImportCandidate[]
  ai: AIProvider
}): Promise<ImportSummary> {
  const { userId } = args
  const started = Date.now()
  const enriched = await enrichCandidates(args.candidates, { getAdapter, ctx: { userId } })
  const items = enriched.map((e) => withWatchTags(e.item))
  const existing = await findPossibleDuplicates(userId, {
    urls: items.flatMap((i) => canonicalUrl((i.normalized as NormalizedJob).applyUrl) ?? []),
    titles: items.map((i) => (i.normalized as NormalizedJob).title),
  })
  const { fresh, duplicates } = dropDuplicates(items, keysOf(existing))
  const freshIds = new Set(fresh.map((i) => i.sourceItemId))
  const source = await ensureManualImportSource(userId)
  const stats =
    fresh.length > 0
      ? await ingestItemsForSource({ userId, source, items: fresh, ai: args.ai, deadline: started + IMPORT_BUDGET_MS })
      : null
  const summary: ImportSummary = {
    imported: stats?.new ?? 0,
    // Rows another import inserted meanwhile count as duplicates too.
    duplicates: duplicates + (stats?.skipped ?? 0),
    enriched: enriched.filter((e) => e.enrichedFrom && freshIds.has(e.item.sourceItemId)).length,
    quarantined: stats?.quarantined ?? 0,
  }
  logger.info('manual_import_done', { userId, sourceId: source.id, picked: args.candidates.length, ...summary, durationMs: Date.now() - started })
  return summary
}
