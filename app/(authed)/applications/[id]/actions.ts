'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { updateStatus } from '@/lib/applications/service'
import { createStage } from '@/lib/stages/service'
import * as appsQ from '@/lib/db/queries/applications'
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

/**
 * Backfill `applied_at` on an existing application — used when an app was
 * added to the tracker after it was actually applied. Accepts a plain
 * YYYY-MM-DD (from the inline date input) or a full ISO string; both are
 * normalized to the start of that UTC day so a picker-only value doesn't
 * accidentally record 00:00 in the server's local tz.
 */
export async function setAppliedAt(
  applicationId: string,
  date: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (typeof applicationId !== 'string' || applicationId.length === 0) {
      return { error: 'Application id is required.' }
    }
    const when = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00Z`)
      : new Date(date)
    if (Number.isNaN(when.getTime())) {
      return { error: 'Invalid date.' }
    }
    const updated = await appsQ.setAppliedAt(userId, applicationId, when)
    if (!updated) return { error: 'Application not found.' }
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath('/applications')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    logger.error('setAppliedAt failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not set applied date.' }
  }
}

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
