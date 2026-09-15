'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { addWatchedCompany } from '@/lib/companies/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  domain: z.string().min(1, 'Domain is required'),
  headquartersCountry: z.string().length(2).optional().or(z.literal('')),
  size: z.string().optional().or(z.literal('')),
  stage: z.string().optional().or(z.literal('')),
})

export async function addCompany(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const raw = Object.fromEntries(formData)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return { error: first?.message ?? 'Invalid input.' }
    }
    await addWatchedCompany({
      userId,
      name: parsed.data.name,
      domain: parsed.data.domain,
      headquartersCountry: parsed.data.headquartersCountry || undefined,
      size: parsed.data.size || undefined,
      stage: parsed.data.stage || undefined,
    })
    revalidatePath('/companies')
    return { success: true }
  } catch (err) {
    logger.error('addCompany failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not add company.' }
  }
}
