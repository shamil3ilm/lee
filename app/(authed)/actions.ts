'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { signOut } from '@/lib/auth'
import { requireUserId } from '@/lib/auth/require-session'
import { updateStatus } from '@/lib/applications/service'
import { logger } from '@/lib/logger'
import { APPLICATION_STATUSES } from '@/lib/ui/status'

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' })
}

export type ActionResult = { success: true } | { error: string }

const moveSchema = z.object({
  applicationId: z.string().uuid(),
  newStatus: z.enum(APPLICATION_STATUSES),
})

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
  const parsed = moveSchema.safeParse({ applicationId, newStatus })
  if (!parsed.success) return { error: 'Invalid move.' }
  try {
    const userId = await requireUserId()
    await updateStatus({ userId, applicationId, newStatus: parsed.data.newStatus })
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
