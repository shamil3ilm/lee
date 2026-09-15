'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { updateStatus } from '@/lib/applications/service'
import { createStage } from '@/lib/stages/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

export async function changeStatus(
  applicationId: string,
  newStatus: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await updateStatus({ userId, applicationId, newStatus })
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath('/applications')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    logger.error('changeStatus failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update status.' }
  }
}

const addStageSchema = z.object({
  applicationId: z.string().uuid(),
  kind: z.string().min(1),
  title: z.string().optional(),
  scheduledAt: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive().optional().or(z.literal('')),
  meetingUrl: z.string().url().optional().or(z.literal('')),
})

export async function addStage(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const raw = Object.fromEntries(formData)
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.length === 0) continue
      cleaned[k] = v
    }
    const parsed = addStageSchema.safeParse(cleaned)
    if (!parsed.success) return { error: 'Invalid stage details.' }
    await createStage({
      userId,
      applicationId: parsed.data.applicationId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      durationMinutes:
        typeof parsed.data.durationMinutes === 'number' ? parsed.data.durationMinutes : undefined,
      meetingUrl:
        typeof parsed.data.meetingUrl === 'string' && parsed.data.meetingUrl.length > 0
          ? parsed.data.meetingUrl
          : undefined,
    })
    revalidatePath(`/applications/${parsed.data.applicationId}`)
    return { success: true }
  } catch (err) {
    logger.error('addStage failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not add stage.' }
  }
}
