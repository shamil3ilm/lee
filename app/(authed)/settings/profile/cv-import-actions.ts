'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { suggestionSnippets, type ImportApplyResult } from '@/lib/import/result'
import { cleanSelection } from '@/lib/import/selection'
import { commitImport, portfolioProfileUrl } from '@/lib/import/service'
import { logger } from '@/lib/logger'
import { applyCvSelection, buildCvImportItems, CV_SKILL_GROUP, cvProposalSchema } from '@/lib/profile/cv-import'
import { canEditPublicFacts } from '@/lib/portfolio/lock'
import { cvImportContext } from '@/lib/profile/importer'
import { ResumeValidationError } from '@/lib/resume/service'

/**
 * CV import, step 2: apply the items the user ticked in the review. Items
 * are rebuilt from the proposal and the current profile here. Public facts
 * are written only while profile editing in lee is on; matching details
 * (lee-only) are saved either way.
 */
export async function applyCvImportAction(proposal: unknown, selection: unknown): Promise<ImportApplyResult> {
  try {
    const userId = await requireUserId()
    const p = cvProposalSchema.safeParse(proposal)
    if (!p.success) return { ok: false, error: 'Nothing to save.' }
    const ctx = await cvImportContext(userId)
    const items = buildCvImportItems(p.data, ctx)
    const sel = cleanSelection(items, selection)
    if (!sel || sel.picked.length === 0) return { ok: false, error: 'Tick at least one item.' }
    const editable = await canEditPublicFacts(userId)
    const importedAt = new Date()
    const r = applyCvSelection(ctx, p.data, items, sel, { source: 'cv', importedAt: importedAt.toISOString() }, editable)
    const batch = await commitImport(userId, { source: 'cv', editable, importedAt, ...r })
    revalidatePath('/settings/profile')
    revalidatePath('/settings/resume')
    return {
      ok: true,
      mode: batch.mode === 'saved' ? 'saved' : 'suggested',
      batchId: batch.id,
      saved: editable ? sel.picked.length : r.counts.matching ?? 0,
      snippets: editable ? [] : suggestionSnippets(items, sel, CV_SKILL_GROUP),
      profileUrl: editable ? null : await portfolioProfileUrl(userId),
    }
  } catch (err) {
    if (err instanceof ResumeValidationError) return { ok: false, error: err.message }
    logger.error('applyCvImport failed', { err: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: 'Could not save the imported items.' }
  }
}
