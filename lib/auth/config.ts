import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextAuthConfig } from 'next-auth'
// Cast db to `any` for the adapter: our client uses a dual driver
// (postgres-js in production, pglite in dev/tests) and @auth/drizzle-adapter's
// type signature expects a single concrete driver. Runtime is fine; this is a
// typing seam only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { db } from '@/lib/db/client'
import { env } from '@/lib/env'
import { isAllowedEmail } from './allowed-email'

export const authConfig: NextAuthConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: DrizzleAdapter(db as any),
  session: { strategy: 'database' },
  providers: [
    Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
  ],
  pages: { signIn: '/signin' },
  callbacks: {
    async signIn({ user }) {
      return isAllowedEmail(user.email)
    },
    async session({ session, user }) {
      if (session.user) session.user.id = user.id
      return session
    },
  },
}
