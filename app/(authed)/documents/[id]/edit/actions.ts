'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { logger } from '@/lib/logger'

const saveInputSchema = z.object({
  documentId: z.string().min(1),
  source: z.string(),
  title: z.string().min(1).max(200).optional(),
})

export type SaveResult = { success: true } | { error: string }

/**
 * Persist edits to a LaTeX document's source (and optionally its title).
 * Preserves any compile-status fields that may already be present on the
 * existing content.
 */
export async function saveLatexSource(input: {
  documentId: string
  source: string
  title?: string
}): Promise<SaveResult> {
  try {
    const userId = await requireUserId()
    const parsed = saveInputSchema.safeParse(input)
    if (!parsed.success) return { error: 'Invalid save payload.' }

    const doc = await documentsQ.getById(userId, parsed.data.documentId)
    if (!doc) return { error: 'Not found.' }
    if (doc.kind !== 'latex_cv' && doc.kind !== 'latex_cover_letter') {
      return { error: 'Document is not a LaTeX document.' }
    }

    const existing = latexDocumentContentSchema.safeParse(doc.content)
    const base = existing.success ? existing.data : { source: '' }
    const content = { ...base, source: parsed.data.source }

    await documentsQ.update(userId, parsed.data.documentId, {
      content,
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
    })
    revalidatePath('/documents')
    revalidatePath(`/documents/${parsed.data.documentId}/edit`)
    return { success: true }
  } catch (err) {
    logger.error('saveLatexSource failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save.' }
  }
}
