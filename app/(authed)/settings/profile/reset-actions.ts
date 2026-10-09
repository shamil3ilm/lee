'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { undoLastImport, type UndoResult } from '@/lib/import/undo'
import { logger } from '@/lib/logger'
import { buildBackup, type ResetBackup } from '@/lib/reset/backup'
import { previewReset } from '@/lib/reset/plan'
import { applyReset, checkConfirm } from '@/lib/reset/service'
import { loadResetState } from '@/lib/reset/state'
import { resetSelectionSchema, type ResetPreview, type ResetSelection } from '@/lib/reset/types'
import { ResumeValidationError } from '@/lib/resume/service'

/**
 * Settings › Profile › Reset details. Preview (exactly what goes), backup
 * (the selected data as JSON, saved by the browser), apply (confirmed; a
 * full reset needs RESET typed — checked here, not only in the dialog) and
 * the one-click "Undo last import".
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

function revalidate(): void {
  revalidatePath('/settings', 'layout')
  revalidatePath('/discoveries')
  revalidatePath('/documents')
}

function parse(raw: unknown): ResetSelection | null {
  const p = resetSelectionSchema.safeParse(raw)
  return p.success ? p.data : null
}

export async function previewResetAction(raw: unknown): Promise<Result<{ preview: ResetPreview }>> {
  const userId = await requireUserId()
  const sel = parse(raw)
  if (!sel) return { ok: false, error: 'Choose what to reset.' }
  try {
    return { ok: true, preview: previewReset(await loadResetState(userId), sel) }
  } catch (err) {
    logger.error('reset_preview_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not prepare the reset.' }
  }
}

export async function backupResetAction(raw: unknown): Promise<Result<{ backup: ResetBackup }>> {
  const userId = await requireUserId()
  const sel = parse(raw)
  if (!sel) return { ok: false, error: 'Choose what to back up.' }
  try {
    return { ok: true, backup: await buildBackup(userId, await loadResetState(userId), sel) }
  } catch (err) {
    logger.error('reset_backup_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not build the backup.' }
  }
}

export async function applyResetAction(raw: unknown, confirmText: unknown): Promise<Result<{ counts: Record<string, number> }>> {
  const userId = await requireUserId()
  const sel = parse(raw)
  if (!sel) return { ok: false, error: 'Choose what to reset.' }
  const refused = checkConfirm(sel, confirmText)
  if (refused) return { ok: false, error: refused }
  try {
    const counts = await applyReset(userId, sel)
    revalidate()
    return { ok: true, counts }
  } catch (err) {
    if (err instanceof ResumeValidationError) return { ok: false, error: err.message }
    logger.error('profile_reset_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not reset. Nothing after the failed step was changed.' }
  }
}

export async function undoLastImportAction(): Promise<UndoResult> {
  const userId = await requireUserId()
  try {
    const r = await undoLastImport(userId)
    if (r.ok) revalidate()
    return r
  } catch (err) {
    logger.error('import_undo_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not undo the import.' }
  }
}
