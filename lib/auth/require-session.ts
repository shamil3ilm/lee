import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Resolve the current session's user id, redirecting to /signin when there is
 * no session. Callers can rely on the returned string being non-empty and
 * never need to touch `session!.user!.id` non-null assertions.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/signin')
  return userId
}
