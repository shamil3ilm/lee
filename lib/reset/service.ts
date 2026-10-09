import * as repoQ from '@/lib/db/queries/githubRepoStats'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as compareQ from '@/lib/db/queries/jobComparison'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import type { NewUserProfile } from '@/lib/db/queries/profile'
import * as variantQ from '@/lib/db/queries/variantReset'
import { readIntentions } from '@/lib/import/intentions'
import { recomputeAfterProfileChange } from '@/lib/import/recompute'
import { undoBatch } from '@/lib/import/undo'
import { logger } from '@/lib/logger'
import { inferLinkKind } from '@/lib/profile/links'
import { saveProfile } from '@/lib/profile/service'
import { saveResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { variantPlan } from './plan'
import { clearSections, clearStudyNotes, overlayCounts, resetLinkKinds, resetOverlay, sectionCount } from './profile'
import { SEARCH_PREF_DEFAULTS } from './search-defaults'
import { loadResetState, type ResetState } from './state'
import { CONFIRM_WORD, isEmptySelection, needsTypedConfirm, type ResetSelection } from './types'

/**
 * SERVER-ONLY. Apply a confirmed reset. Only what is selected changes;
 * applications, documents (sent or not), tailored CVs and discoveries are
 * never written. Public master-profile sections reset only while profile
 * editing in lee is on. Afterwards the existing re-evaluation jobs
 * recompute relevance, Match Scores and best CVs, and `profile_reset` is
 * logged with counts only.
 */

export function checkConfirm(sel: ResetSelection, confirmText: unknown): string | null {
  if (isEmptySelection(sel)) return 'Choose what to reset.'
  if (needsTypedConfirm(sel) && confirmText !== CONFIRM_WORD) return `Type ${CONFIRM_WORD} to confirm a full reset.`
  return null
}

async function undoImports(userId: string, sel: ResetSelection, counts: Record<string, number>): Promise<void> {
  for (const id of sel.importBatchIds) {
    const r = await undoBatch(userId, id)
    if (r.ok) counts.imports = (counts.imports ?? 0) + 1
  }
}

/** Master profile changes (sections, overlay, study notes) in one save. */
function nextResume(s: ResetState, sel: ResetSelection, counts: Record<string, number>): ResumeProfile | null {
  if (!s.resume) return null
  let next = s.resume
  if (s.editable && sel.profile.length > 0) {
    for (const p of sel.profile) counts[`profile_${p}`] = sectionCount(s.resume, p)
    next = clearSections(next, sel.profile)
  }
  if (sel.targets.includes('overlay')) {
    const c = overlayCounts(next, [])
    counts.readiness = c.readiness
    counts.wordings = c.wordings
    next = resetOverlay(next)
  }
  if (sel.targets.includes('study')) next = clearStudyNotes(next)
  return next === s.resume ? null : next
}

async function resetOrphans(userId: string, s: ResetState, counts: Record<string, number>): Promise<void> {
  const orphan = new Set(s.orphanIntentions.map((i) => `${i.section}:${i.name}`))
  for (const b of s.batches) {
    const list = readIntentions(b.intentions)
    const left = list.filter((i) => !orphan.has(`${i.section}:${i.name}`))
    if (left.length !== list.length) await batchesQ.update(userId, b.id, { intentions: left })
  }
  for (const repo of s.orphanRepoLinks) await repoQ.setLink(userId, repo, null)
  counts.orphans = s.orphanIntentions.length + s.orphanRepoLinks.length
}

function flatPatch(s: ResetState, sel: ResetSelection, counts: Record<string, number>): Partial<NewUserProfile> {
  const patch: Partial<NewUserProfile> = {}
  const t = new Set(sel.targets)
  if (t.has('links')) {
    counts.links = s.links.length
    patch.links = []
  } else if (t.has('overlay')) {
    counts.linkKinds = s.links.filter((l) => l.kind !== inferLinkKind(l.url)).length
    patch.links = resetLinkKinds(s.links)
  }
  if (t.has('searchPrefs')) Object.assign(patch, SEARCH_PREF_DEFAULTS)
  if (t.has('learnedTitles')) {
    counts.learnedTitles = Object.keys((s.row?.learnedTitles ?? {}) as Record<string, unknown>).length
    patch.learnedTitles = {}
  }
  return patch
}

export async function applyReset(userId: string, sel: ResetSelection, now: Date = new Date()): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  // Imports first: their undo finds items by provenance, before any section reset.
  await undoImports(userId, sel, counts)
  const s = await loadResetState(userId)
  const resume = nextResume(s, sel, counts)
  if (resume) await saveResumeProfile(userId, resume)
  if (sel.targets.includes('overlay')) await resetOrphans(userId, s, counts)
  const patch = flatPatch(s, sel, counts)
  if (Object.keys(patch).length > 0) await saveProfile(userId, patch)
  const t = new Set(sel.targets)
  if (t.has('currentJob')) {
    counts.currentJob = s.currentJob ? 1 : 0
    await compareQ.save(userId, { currentJob: null, narratives: {} })
  }
  if (t.has('variants')) {
    const plan = variantPlan(s)
    counts.variantsDeleted = await variantQ.remove(userId, plan.remove)
    counts.variantsArchived = await variantQ.archive(userId, plan.archive, now)
  }
  if (t.has('connections')) counts.connections = await linkedinQ.deleteAllConnections(userId)
  logger.info('profile_reset', { userId, ...counts })
  await recomputeAfterProfileChange(userId)
  return counts
}
