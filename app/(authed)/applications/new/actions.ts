'use server'
import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { createApplicationFromUrl } from '@/lib/applications/service'
import { getAIProvider } from '@/lib/ai'

const urlSchema = z.object({ url: z.string().url() })

export async function addFromUrl(formData: FormData) {
  const session = await auth()
  const userId = session!.user!.id
  const { url } = urlSchema.parse({ url: formData.get('url') })
  const result = await createApplicationFromUrl({ userId, url, ai: getAIProvider() })
  revalidatePath('/applications')
  redirect(`/applications/${result.application.id}`)
}
