import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * The current session, memoized per request with React `cache()` so the
 * authed layout and the page (and any nested server component) decode the
 * session cookie / hit the session store once. Outside a React server render
 * (route handlers, tests) `cache` is a pass-through.
 */
export const getSession = cache(() => auth())

/**
 * Resolve the current session's user id, redirecting to /signin when there is
 * no session. Callers can rely on the returned string being non-empty and
 * never need to touch `session!.user!.id` non-null assertions.
 */
export const requireUserId = cache(async (): Promise<string> => {
  const session = await getSession()
  const userId = session?.user?.id
  if (!userId) redirect('/signin')
  return userId
})
