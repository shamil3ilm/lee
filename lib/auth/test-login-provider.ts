import Credentials from 'next-auth/providers/credentials'
import type { User } from 'next-auth'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { assertTestLoginNotInProduction, isTestLoginEnabled } from './test-login-guard'
import { TEST_LOGIN_EMAIL, TEST_LOGIN_NAME, TEST_LOGIN_PROVIDER_ID } from './test-login'

// v17 §9.1 — local-only E2E test sign-in.
//
// Mechanism: an Auth.js Credentials provider, appended to the Node config
// (lib/auth/config.ts) only when enabled. It works with the existing JWT
// session strategy: authorize() returns the seeded test user, the jwt
// callback copies its id into the token, and the edge proxy validates the
// cookie exactly as it does for Google sessions.
//
// Why it cannot touch the real account:
//   - it takes NO input: there is no email/password field, authorize()
//     ignores the request and resolves only TEST_LOGIN_EMAIL;
//   - it never creates or links an `accounts` row (Credentials bypasses the
//     adapter), so Google's allowDangerousEmailAccountLinking is unaffected;
//   - it looks the user up but never creates it (run `pnpm e2e:seed`).
//
// Why it cannot reach production: see test-login-guard.ts and the literal
// NODE_ENV checks at every import site.

type SignInParams = {
  user: { email?: string | null }
  account?: { provider?: string } | null
}

export async function authorizeTestUser(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<User | null> {
  if (!isTestLoginEnabled(env)) return null
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, TEST_LOGIN_EMAIL))
    .limit(1)
  if (!row) {
    logger.warn('test_login.user_missing', { hint: 'run `pnpm e2e:seed` first' })
    return null
  }
  return { id: row.id, email: row.email, name: row.name ?? TEST_LOGIN_NAME }
}

/** True only for a sign-in made through this provider for the fixed identity. */
export function isTestLoginSignIn(
  params: SignInParams,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    isTestLoginEnabled(env) &&
    params.account?.provider === TEST_LOGIN_PROVIDER_ID &&
    params.user.email === TEST_LOGIN_EMAIL
  )
}

export interface TestLogin {
  provider: ReturnType<typeof Credentials>
  isTestLoginSignIn: typeof isTestLoginSignIn
}

/** Returns the provider bundle when enabled, otherwise null. */
export function loadTestLogin(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TestLogin | null {
  assertTestLoginNotInProduction(env)
  if (!isTestLoginEnabled(env)) return null
  logger.warn('test_login.enabled', { provider: TEST_LOGIN_PROVIDER_ID })
  return {
    provider: Credentials({
      id: TEST_LOGIN_PROVIDER_ID,
      name: 'E2E test login',
      credentials: {},
      authorize: () => authorizeTestUser(),
    }),
    isTestLoginSignIn,
  }
}
