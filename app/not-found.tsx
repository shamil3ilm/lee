import type { Metadata } from 'next'
import { getSession } from '@/lib/auth/require-session'
import { NotFoundView } from '@/components/errors/not-found-view'
import { StatusFrame } from '@/components/errors/status-view'

export const metadata: Metadata = { title: 'Page not found' }

/**
 * Unmatched URLs anywhere in the app (and `notFound()` outside the signed-in
 * shell). Rendered inside the root layout, so the theme applies.
 */
export default async function NotFound() {
  const session = await getSession()
  return (
    <StatusFrame>
      <NotFoundView signedIn={Boolean(session?.user)} />
    </StatusFrame>
  )
}
