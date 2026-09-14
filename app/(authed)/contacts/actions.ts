'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { createContact } from '@/lib/contacts/service'

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  role: z.string().optional().or(z.literal('')),
  companyId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
})

export async function addContact(formData: FormData): Promise<void> {
  const session = await auth()
  const userId = session!.user!.id
  const raw = Object.fromEntries(formData)
  const data = schema.parse(raw)
  await createContact({
    userId,
    name: data.name,
    email: data.email ? data.email : null,
    phone: data.phone ? data.phone : null,
    linkedinUrl: data.linkedinUrl ? data.linkedinUrl : null,
    role: data.role ? data.role : null,
    companyId: data.companyId ? data.companyId : null,
    notes: data.notes ? data.notes : null,
  })
  revalidatePath('/contacts')
}
