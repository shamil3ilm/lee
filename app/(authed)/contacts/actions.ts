'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { createContact } from '@/lib/contacts/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  role: z.string().optional().or(z.literal('')),
  companyId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
})

export async function addContact(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const raw = Object.fromEntries(formData)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return { error: first?.message ?? 'Invalid input.' }
    }
    await createContact({
      userId,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      linkedinUrl: parsed.data.linkedinUrl || null,
      role: parsed.data.role || null,
      companyId: parsed.data.companyId || null,
      notes: parsed.data.notes || null,
    })
    revalidatePath('/contacts')
    return { success: true }
  } catch (err) {
    logger.error('addContact failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not add contact.' }
  }
}
