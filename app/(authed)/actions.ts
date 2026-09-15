'use server'
import { revalidatePath } from 'next/cache'
import { signOut } from '@/lib/auth'
import { requireUserId } from '@/lib/auth/require-session'
import { updateStatus } from '@/lib/applications/service'
import { logger } from '@/lib/logger'

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' })
}

export type ActionResult = { success: true } | { error: string }

/**
 * Kanban drag-to-column persistence. Wraps applications/service.updateStatus
 * with a friendly error envelope + revalidation for the dashboard and
 * applications list. Kept here (not in [id]/actions.ts) so the Kanban
 * component — which lives in components/ and doesn't know about the [id]
 * route — has a stable import path.
 */
export async function changeApplicationStatus(
  applicationId: string,
  newStatus: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await updateStatus({ userId, applicationId, newStatus })
    revalidatePath('/')
    revalidatePath('/applications')
    revalidatePath(`/applications/${applicationId}`)
    return { success: true }
  } catch (err) {
    logger.error('changeApplicationStatus failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update status.' }
  }
}
