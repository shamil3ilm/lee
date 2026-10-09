import type { NewUserProfile } from '@/lib/db/queries/profile'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as portfolioQ from '@/lib/db/queries/portfolioPublish'
import { logger } from '@/lib/logger'
import { saveProfile } from '@/lib/profile/service'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import type { ImportSource, ResumeProfile } from '@/lib/resume/types'
import type { ImportChanges } from './changes'
import { applyReadinessIntentions, mergeIntentions, readIntentions, type ReadinessIntention } from './intentions'
import { recomputeAfterProfileChange } from './recompute'
import { profileJsonUrl } from './snippet'

/**
 * SERVER-ONLY. Commit a confirmed import review: save what the importer
 * produced and record the batch (provenance) so "Undo last import" and
 * Reset can reverse exactly this import. The importers are pure; this is
 * the one place that writes.
 */

export interface CommitInput {
  source: ImportSource
  /** Public facts were written (profile editing in lee is on). */
  editable: boolean
  importedAt: Date
  patch: Partial<NewUserProfile>
  resume: ResumeProfile | null
  intentions: readonly ReadinessIntention[]
  changes: ImportChanges
  counts: Record<string, number>
}

export async function commitImport(userId: string, input: CommitInput): Promise<batchesQ.ImportBatchRow> {
  if (input.resume && !input.editable) throw new Error('commitImport: public facts while profile editing is off')
  if (input.resume) await saveResumeProfile(userId, input.resume)
  if (Object.keys(input.patch).length > 0) await saveProfile(userId, input.patch)
  const batch = await batchesQ.create(userId, {
    source: input.source,
    mode: input.editable ? 'saved' : 'suggested',
    importedAt: input.importedAt,
    counts: input.counts,
    intentions: input.intentions,
    changes: input.changes,
  })
  logger.info('profile_import_applied', { userId, source: input.source, mode: batch.mode, ...input.counts, intentions: input.intentions.length })
  if (input.resume || Object.keys(input.patch).length > 0) await recomputeAfterProfileChange(userId)
  return batch
}

/** The GitHub link to the portfolio's profile.json, when a portfolio repo is configured. */
export async function portfolioProfileUrl(userId: string): Promise<string | null> {
  const config = await portfolioQ.get(userId)
  return config ? profileJsonUrl(config) : null
}

/** Every readiness intention not applied or undone yet (newer batches win). */
export async function activeIntentions(userId: string): Promise<ReadinessIntention[]> {
  const rows = await batchesQ.listActive(userId, 200)
  return mergeIntentions(...[...rows].reverse().map((r) => readIntentions(r.intentions)))
}

/**
 * Give items that arrived (e.g. through the portfolio sync) the readiness
 * the user chose when importing them, then drop the applied intentions.
 * The sync calls this after it writes the pulled profile.
 */
export async function applyPendingIntentions(userId: string): Promise<number> {
  const intentions = await activeIntentions(userId)
  if (intentions.length === 0) return 0
  const { profile } = await getResumeProfile(userId)
  const { profile: next, applied } = applyReadinessIntentions(profile, intentions)
  if (applied.length === 0) return 0
  await saveResumeProfile(userId, next)
  const done = new Set(applied.map((i) => `${i.section}:${i.name}`))
  for (const row of await batchesQ.listActive(userId, 200)) {
    const list = readIntentions(row.intentions)
    const left = list.filter((i) => !done.has(`${i.section}:${i.name}`))
    if (left.length !== list.length) await batchesQ.update(userId, row.id, { intentions: left })
  }
  await recomputeAfterProfileChange(userId)
  return applied.length
}
