'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveMasterCV } from '@/lib/documents/master'
import { masterCvSchema, type MasterCV } from '@/lib/documents/types'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true; documentId: string } | { error: string }

export async function saveMasterCvAction(cv: MasterCV): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const validated = masterCvSchema.parse(cv)
    const doc = await saveMasterCV(userId, validated)
    revalidatePath('/settings/cv')
    revalidatePath('/documents')
    return { success: true, documentId: doc.id }
  } catch (err) {
    logger.error('saveMasterCv failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save master CV.' }
  }
}
