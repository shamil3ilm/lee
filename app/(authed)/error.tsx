'use client'
import { ErrorView } from '@/components/errors/error-view'

/** A signed-in page threw: the shell (nav, header) stays, the page area shows the error screen. */
export default function AuthedError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} boundary="authed" showLogsLink />
}
