'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as documentsQ from '@/lib/db/queries/documents'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
})

/** Rename a document (title only; content and version are untouched). */
export async function renameDocument(id: string, title: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const parsed = renameSchema.safeParse({ id, title })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return { error: issue?.path[0] === 'id' ? 'Document not found.' : (issue?.message ?? 'Invalid title.') }
    }
    const ok = await documentsQ.rename(userId, parsed.data.id, parsed.data.title)
    if (!ok) return { error: 'Document not found.' }
    revalidatePath('/documents')
    revalidatePath('/applications/[id]', 'page')
    return { success: true }
  } catch (err) {
    logger.error('renameDocument failed', { id, err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not rename document.' }
  }
}
