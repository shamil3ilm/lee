import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextAuthConfig } from 'next-auth'
import { and, eq } from 'drizzle-orm'
// Cast db to `any` for the adapter: our client uses a dual driver
// (postgres-js in production, pglite in dev/tests) and @auth/drizzle-adapter's
// type signature expects a single concrete driver. Runtime is fine; this is a
// typing seam only.
import { db } from '@/lib/db/client'
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema'
import { edgeAuthConfig } from './edge-config'
import { logger } from '@/lib/logger'

// Full Node-runtime config. Inherits JWT session strategy from
// `edgeAuthConfig` (see note there). The adapter is still needed so Auth.js
// can persist users + OAuth accounts at signin time; only session lookups on
// each request are avoided.
//
// We pass explicit table references because our schema uses plural table
// names (users/accounts/sessions/verificationTokens) while the adapter
// defaults to singular. Without this mapping the adapter queries
// non-existent "user"/"account" tables and fails with Postgres 42P01.
export const authConfig = {
  ...edgeAuthConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: DrizzleAdapter(db as any, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any),
  events: {
    // Auth.js's DrizzleAdapter only INSERTS the accounts row (via linkAccount)
    // on first signin. Re-consenting with expanded scopes returns fresh
    // access/refresh tokens + updated scope from Google, but the DB row is
    // never updated — so features that read `accounts.scope` (e.g. Gmail /
    // Calendar sync detection) keep reporting the old scope set.
    //
    // This event fires after every successful signin. It refreshes the token
    // fields + scope on the existing row so a re-consent flow actually takes
    // effect end-to-end.
    async signIn({ user, account }) {
      if (!user?.id || account?.provider !== 'google') return
      // Build patch conditionally so we don't wipe a still-valid refresh_token
      // if Google's response omits one (they only re-issue on consent prompt).
      const patch: Record<string, unknown> = {}
      if (account.access_token !== undefined) patch.access_token = account.access_token
      if (account.refresh_token !== undefined) patch.refresh_token = account.refresh_token
      if (account.expires_at !== undefined) patch.expires_at = account.expires_at
      if (account.token_type !== undefined) patch.token_type = account.token_type
      if (account.scope !== undefined) patch.scope = account.scope
      if (account.id_token !== undefined) patch.id_token = account.id_token
      if (typeof account.session_state === 'string') {
        patch.session_state = account.session_state
      }
      if (Object.keys(patch).length === 0) return
      try {
        await db
          .update(accounts)
          .set(patch)
          .where(
            and(
              eq(accounts.userId, user.id),
              eq(accounts.provider, 'google'),
            ),
          )
      } catch (err) {
        logger.error('signIn event token refresh failed', {
          err: err instanceof Error ? err.message : String(err),
        })
      }
    },
  },
} satisfies NextAuthConfig
