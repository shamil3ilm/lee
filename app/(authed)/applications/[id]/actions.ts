'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { updateStatus } from '@/lib/applications/service'
import { createStage } from '@/lib/stages/service'

export async function changeStatus(applicationId: string, newStatus: string) {
  const session = await auth()
  await updateStatus({ userId: session!.user!.id, applicationId, newStatus })
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/applications')
}

const addStageSchema = z.object({
  applicationId: z.string().uuid(),
  kind: z.string().min(1),
  title: z.string().optional(),
  scheduledAt: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive().optional().or(z.literal('')),
  meetingUrl: z.string().url().optional().or(z.literal('')),
})

export async function addStage(formData: FormData) {
  const session = await auth()
  const userId = session!.user!.id
  const raw = Object.fromEntries(formData)
  // Strip empty string values so zod optional() works cleanly
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.length === 0) continue
    cleaned[k] = v
  }
  const parsed = addStageSchema.parse(cleaned)
  await createStage({
    userId,
    applicationId: parsed.applicationId,
    kind: parsed.kind,
    title: parsed.title,
    scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : undefined,
    durationMinutes:
      typeof parsed.durationMinutes === 'number' ? parsed.durationMinutes : undefined,
    meetingUrl:
      typeof parsed.meetingUrl === 'string' && parsed.meetingUrl.length > 0
        ? parsed.meetingUrl
        : undefined,
  })
  revalidatePath(`/applications/${parsed.applicationId}`)
}
