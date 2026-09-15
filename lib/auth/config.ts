import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextAuthConfig } from 'next-auth'
// Cast db to `any` for the adapter: our client uses a dual driver
// (postgres-js in production, pglite in dev/tests) and @auth/drizzle-adapter's
// type signature expects a single concrete driver. Runtime is fine; this is a
// typing seam only.
import { db } from '@/lib/db/client'
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema'
import { edgeAuthConfig } from './edge-config'

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
} satisfies NextAuthConfig
