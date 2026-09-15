import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'
import { env } from '@/lib/env'
import { isAllowedEmail } from './allowed-email'

// Edge-safe Auth.js config: no DB adapter, no Node-only imports.
// Used by `proxy.ts` (middleware) which runs on the Edge runtime.
// The full DB-backed config lives in `./config.ts` and is used by API
// routes and RSC (Node runtime).
//
// Session strategy is JWT end-to-end. This is the correct Auth.js v5 pattern
// for edge-compatible middleware: sessions live in an encrypted cookie so the
// edge runtime can validate them without a DB round-trip. The DrizzleAdapter
// in `./config.ts` is still used at signin time to persist users + accounts.
export const edgeAuthConfig = {
  providers: [
    Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
  ],
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    async signIn({ user }) {
      return isAllowedEmail(user.email)
    },
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id as string
      return session
    },
  },
} satisfies NextAuthConfig
