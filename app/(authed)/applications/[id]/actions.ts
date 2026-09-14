'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { updateStatus } from '@/lib/applications/service'

export async function changeStatus(applicationId: string, newStatus: string) {
  const session = await auth()
  await updateStatus({ userId: session!.user!.id, applicationId, newStatus })
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/applications')
}
