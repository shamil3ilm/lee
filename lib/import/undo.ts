import type { NewUserProfile, UserProfile } from '@/lib/db/queries/profile'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import { logger } from '@/lib/logger'
import { canEditPublicFacts } from '@/lib/portfolio/lock'
import { readProfileLinks } from '@/lib/profile/links'
import { readLinkedProfile } from '@/lib/profile/url-import'
import { saveProfile } from '@/lib/profile/service'
import { readStoredProfile, saveResumeProfile } from '@/lib/resume/service'
import { readChanges, type ImportChanges } from './changes'
import { batchItemCounts, removeBatchItems, restoreUpdatedItems } from './provenance'
import { recomputeAfterProfileChange } from './recompute'
import { dropDanglingCaseStudies } from '@/lib/resume/integrity'

/**
 * SERVER-ONLY. Reverse one import batch from its provenance: remove the
 * master-profile items it added, put back fields and items it replaced
 * (only where the user has not changed them since), restore the page
 * evidence, drop its readiness intentions and the connections it added.
 * Public facts are only touched while profile editing in lee is on.
 */

export const UNDO_WINDOW_DAYS = 7

export type UndoResult = { ok: true; removed: number; restored: number; connections: number } | { ok: false; error: string }

const lower = (s: string): string => s.trim().toLowerCase()

function withoutNames(list: readonly string[], names: readonly string[] | undefined): string[] {
  if (!names?.length) return [...list]
  const drop = new Set(names.map(lower))
  return list.filter((x) => !drop.has(lower(x)))
}

/** Profile-row fields to put back; each only when it still holds the imported value. */
function flatPatch(row: UserProfile | null, c: ImportChanges, batchAt: string): { patch: Partial<NewUserProfile>; restored: number } {
  const patch: Partial<NewUserProfile> = {}
  let restored = 0
  const back = <K extends 'headline' | 'summaryMd' | 'seniority'>(k: K): void => {
    const ch = c[k]
    if (ch && (row?.[k] ?? null) === ch.after) {
      patch[k] = ch.before
      restored += 1
    }
  }
  back('headline')
  back('summaryMd')
  back('seniority')
  if (c.yearsExperience && (row?.yearsExperience ?? null) === c.yearsExperience.after) {
    patch.yearsExperience = c.yearsExperience.before
    restored += 1
  }
  if (c.skillsAdded?.length) patch.skills = withoutNames(row?.skills ?? [], c.skillsAdded)
  if (c.industriesAdded?.length) patch.industries = withoutNames(row?.industries ?? [], c.industriesAdded)
  if (c.roleTypesAdded?.length) patch.roleTypes = withoutNames(row?.roleTypes ?? [], c.roleTypesAdded)
  if (c.stackWeightsAdded?.length) {
    const drop = new Set(c.stackWeightsAdded)
    const weights = (row?.stackWeights ?? {}) as Record<string, number>
    patch.stackWeights = Object.fromEntries(Object.entries(weights).filter(([k]) => !drop.has(k))) as NewUserProfile['stackWeights']
  }
  if (c.linksAdded?.length || c.linksUpdated?.length) {
    const added = new Set(c.linksAdded ?? [])
    patch.links = readProfileLinks(row?.links)
      .filter((l) => !added.has(l.id))
      .map((l) => {
        const u = c.linksUpdated?.find((x) => x.id === l.id)
        const after = u?.after as { url?: string } | undefined
        if (!u || after?.url !== l.url) return l
        restored += 1
        return u.before as typeof l
      })
  }
  if ('linkedBefore' in c) {
    const current = readLinkedProfile(row?.linkedProfile)
    if (current?.fetchedAt === batchAt) patch.linkedProfile = (c.linkedBefore ?? null) as NewUserProfile['linkedProfile']
  }
  return { patch, restored }
}

export async function undoBatch(userId: string, batchId: string, now: Date = new Date()): Promise<UndoResult> {
  const batch = await batchesQ.getById(userId, batchId)
  if (!batch || batch.undoneAt) return { ok: false, error: 'That import was already undone.' }
  const c = readChanges(batch.changes)
  const at = batch.importedAt.toISOString()
  let removed = 0
  let restored = 0

  const stored = await readStoredProfile(userId)
  if (stored && batch.mode === 'saved' && (await canEditPublicFacts(userId))) {
    removed += Object.values(batchItemCounts(stored, { source: batch.source, importedAt: at })).reduce((a, b) => a + b, 0)
    const back = restoreUpdatedItems(removeBatchItems(stored, { source: batch.source, importedAt: at }), c.resumeUpdated ?? [])
    restored += back.restored
    if (removed + back.restored > 0) await saveResumeProfile(userId, dropDanglingCaseStudies(back.profile))
  }

  const row = await profileQ.get(userId)
  const flat = flatPatch(row, c, at)
  restored += flat.restored
  if (Object.keys(flat.patch).length > 0) await saveProfile(userId, flat.patch)

  if ('linkedinImportBefore' in c) {
    const prev = c.linkedinImportBefore as { headline: string; summary: string; positions: Array<Record<string, string>> } | null
    if (prev) await linkedinQ.saveImport(userId, prev)
    else await linkedinQ.deleteImport(userId)
  }
  const connections = c.connections ? await linkedinQ.deleteConnectionsByBatch(userId, batch.id) : 0
  await batchesQ.update(userId, batch.id, { undoneAt: now })
  logger.info('import_undone', { userId, source: batch.source, removed, restored, connections })
  await recomputeAfterProfileChange(userId)
  return { ok: true, removed, restored, connections }
}

/** The most recent import still inside the undo window, or null. */
export async function lastUndoableImport(userId: string, now: Date = new Date()): Promise<batchesQ.ImportBatchRow | null> {
  const since = new Date(now.getTime() - UNDO_WINDOW_DAYS * 86_400_000)
  const [latest] = await batchesQ.listActive(userId, 1, since)
  return latest ?? null
}

export async function undoLastImport(userId: string, now: Date = new Date()): Promise<UndoResult> {
  const latest = await lastUndoableImport(userId, now)
  if (!latest) return { ok: false, error: `No import in the last ${UNDO_WINDOW_DAYS} days to undo.` }
  return undoBatch(userId, latest.id, now)
}
