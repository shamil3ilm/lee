import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextAuthConfig } from 'next-auth'
// Cast db to `any` for the adapter: our client uses a dual driver
// (postgres-js in production, pglite in dev/tests) and @auth/drizzle-adapter's
// type signature expects a single concrete driver. Runtime is fine; this is a
// typing seam only.
import { db } from '@/lib/db/client'
import { edgeAuthConfig } from './edge-config'

export const authConfig = {
  ...edgeAuthConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: DrizzleAdapter(db as any),
  session: { strategy: 'database' },
} satisfies NextAuthConfig
