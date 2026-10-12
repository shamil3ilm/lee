import type { ComponentType } from 'react'
import Link from 'next/link'
import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogoMark } from '@/components/brand/logo'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

// v17 §9.1 — the E2E test sign-in button exists only in local development.
// The literal NODE_ENV check is folded by `next build`, so neither the import
// nor the button is part of a production bundle.
async function loadTestLoginForm(): Promise<ComponentType | null> {
  if (process.env.NODE_ENV !== 'production') {
    const [{ isTestLoginEnabled }, { TestLoginForm }] = await Promise.all([
      import('@/lib/auth/test-login-guard'),
      import('./test-login-form'),
    ])
    if (isTestLoginEnabled(process.env)) return TestLoginForm
  }
  return null
}

/** Auth.js sends a refused sign-in back here with ?error=AccessDenied. */
function errorMessage(error: string | string[] | undefined): string | null {
  const code = Array.isArray(error) ? error[0] : error
  if (!code) return null
  if (code === 'AccessDenied') return `${APP_NAME} is invite-only. Ask the owner for an invite, then sign in with the invited Google account.`
  return 'Sign-in did not complete. Try again.'
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const TestLoginForm = await loadTestLoginForm()
  const message = errorMessage((await searchParams).error)
  return (
    // Padding, not margin: a top margin here collapses through <body> and
    // measured as a 0.09 layout shift when the card streamed in.
    <div className="mx-auto max-w-sm px-4 pt-32">
      <Card>
        <CardHeader className="items-center text-center">
          <LogoMark size={56} className="mb-2" />
          <CardTitle className="text-xl">Sign in to {APP_NAME}</CardTitle>
          <CardDescription>{APP_TAGLINE}</CardDescription>
        </CardHeader>
        <CardContent>
          {message ? (
            <p role="alert" className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
              {message}
            </p>
          ) : null}
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
          >
            <Button type="submit" className="w-full">
              Continue with Google
            </Button>
          </form>
          {TestLoginForm ? <TestLoginForm /> : null}
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link href="/about" className="hover:text-foreground">
          About
        </Link>
        {' · '}
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </p>
    </div>
  )
}
