import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { TEST_LOGIN_PROVIDER_ID } from '@/lib/auth/test-login'
import { isTestLoginEnabled } from '@/lib/auth/test-login-guard'

// v17 §9.1 — local E2E test sign-in button. Loaded by the sign-in page only
// inside a literal `process.env.NODE_ENV !== 'production'` branch, so it is
// never compiled into a production build; the action re-checks the flag.
export function TestLoginForm() {
  return (
    <form
      action={async () => {
        'use server'
        if (!isTestLoginEnabled(process.env)) return
        await signIn(TEST_LOGIN_PROVIDER_ID, { redirectTo: '/' })
      }}
      className="mt-3 border-t pt-3"
    >
      <Button type="submit" variant="outline" className="w-full" data-testid="e2e-test-login">
        Sign in as E2E test user
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Local development only (E2E_TEST_LOGIN=1)
      </p>
    </form>
  )
}
