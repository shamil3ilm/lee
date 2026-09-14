'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { addWatchedCompany } from '@/lib/companies/service'

const schema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  headquartersCountry: z.string().length(2).optional().or(z.literal('')),
  size: z.string().optional().or(z.literal('')),
  stage: z.string().optional().or(z.literal('')),
})

export async function addCompany(formData: FormData) {
  const session = await auth()
  const raw = Object.fromEntries(formData)
  const data = schema.parse(raw)
  await addWatchedCompany({
    userId: session!.user!.id,
    name: data.name,
    domain: data.domain,
    headquartersCountry: data.headquartersCountry ? data.headquartersCountry : undefined,
    size: data.size ? data.size : undefined,
    stage: data.stage ? data.stage : undefined,
  })
  revalidatePath('/companies')
}
