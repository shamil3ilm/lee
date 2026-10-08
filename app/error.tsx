'use client'
import { ErrorView } from '@/components/errors/error-view'
import { StatusFrame } from '@/components/errors/status-view'

/**
 * Errors outside the signed-in shell (sign-in, About, Privacy) and in the
 * authed layout itself. The root layout still renders, so the theme applies.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <StatusFrame>
      <ErrorView error={error} retry={retry} boundary="app" />
    </StatusFrame>
  )
}
