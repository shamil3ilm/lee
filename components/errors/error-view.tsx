'use client'
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusView } from '@/components/errors/status-view'
import { reportClientError, toClientErrorReport, type ClientErrorReport } from '@/lib/errors/client-report'

interface ErrorViewProps {
  error: Error & { digest?: string }
  retry: () => void
  boundary: ClientErrorReport['boundary']
  /** Signed-in screens link to Settings › Logs, where the report lands. */
  showLogsLink?: boolean
}

/**
 * The friendly error screen. The raw message is never shown: it is reported
 * to the server (and server errors are already logged with their digest),
 * and only the digest appears here as a code to match against the logs.
 */
export function ErrorView({ error, retry, boundary, showLogsLink = false }: ErrorViewProps) {
  const pathname = usePathname()
  React.useEffect(() => {
    reportClientError(toClientErrorReport(error, pathname ?? '/', boundary))
  }, [error, pathname, boundary])

  return (
    <StatusView
      eyebrow="Something went wrong"
      title="This page didn't load"
      description="It's usually temporary. Try again, and if it keeps happening, go home and come back later. Your saved work is safe."
      actions={
        <>
          <Button type="button" onClick={() => retry()}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </>
      }
      footer={
        <>
          {error.digest ? (
            <p>
              Error code <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{error.digest}</code>
            </p>
          ) : null}
          {showLogsLink ? (
            <p>
              The details are in{' '}
              <Link
                href="/settings/logs?level=problems"
                className="inline-flex min-h-6 items-center underline underline-offset-4 hover:text-foreground"
              >
                Settings › Logs
              </Link>
              .
            </p>
          ) : null}
        </>
      }
    />
  )
}
