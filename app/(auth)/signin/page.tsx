import type { ComponentType } from 'react'
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

export default async function SignInPage() {
  const TestLoginForm = await loadTestLoginForm()
  return (
    <div className="mx-auto mt-32 max-w-sm px-4">
      <Card>
        <CardHeader className="items-center text-center">
          <LogoMark size={56} className="mb-2" />
          <CardTitle className="text-xl">Sign in to {APP_NAME}</CardTitle>
          <CardDescription>{APP_TAGLINE}</CardDescription>
        </CardHeader>
        <CardContent>
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
    </div>
  )
}
