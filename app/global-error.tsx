'use client'
import './globals.css'
import * as React from 'react'
import { StatusView } from '@/components/errors/status-view'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/brand'
import { reportClientError, toClientErrorReport } from '@/lib/errors/client-report'

/** The theme the app last used (next-themes' key), else the OS preference. */
function resolveTheme(): 'light' | 'dark' {
  try {
    const stored = window.localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be blocked; fall through to the OS preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Replaces the root layout when it (or the theme provider) fails. It renders
 * its own document, so it imports the tokens itself and applies the theme
 * class; plain links, because the router may be what broke.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // Rendered in the browser after a crash, so storage is readable here; the
  // html element tolerates a server/client class difference.
  const [theme] = React.useState<'light' | 'dark'>(() => (typeof window === 'undefined' ? 'light' : resolveTheme()))
  React.useEffect(() => {
    reportClientError(toClientErrorReport(error, window.location.pathname, 'global'))
  }, [error])

  return (
    <html lang="en" className={theme} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <title>{`Something went wrong · ${APP_NAME}`}</title>
        <main id="main" className="flex min-h-screen items-start justify-center">
          <StatusView
            eyebrow="Something went wrong"
            title={`${APP_NAME} couldn't load`}
            description="It's usually temporary. Try again, or reload the home page. Your saved work is safe."
            actions={
              <>
                <Button type="button" onClick={() => retry()}>
                  Try again
                </Button>
                <Button asChild variant="outline">
                  {/* A full page load on purpose: the client router may be what failed. */}
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a href="/">Go home</a>
                </Button>
              </>
            }
            footer={
              error.digest ? (
                <p>
                  Error code{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{error.digest}</code>
                </p>
              ) : null
            }
          />
        </main>
      </body>
    </html>
  )
}
