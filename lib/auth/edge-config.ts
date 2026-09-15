import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'
import { env } from '@/lib/env'
import { isAllowedEmail } from './allowed-email'

// Edge-safe Auth.js config: no DB adapter, no Node-only imports.
// Used by `proxy.ts` (middleware) which runs on the Edge runtime.
// The full DB-backed config lives in `./config.ts` and is used by API
// routes and RSC (Node runtime).
export const edgeAuthConfig = {
  providers: [
    Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
  ],
  trustHost: true,
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
} satisfies NextAuthConfig
