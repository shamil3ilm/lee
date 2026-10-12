import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'
import { env } from '@/lib/env'
import { isAllowedEmail } from './allowed-email'
import { BASE_SCOPES } from '@/lib/google/scope-names'

// Adapter-free Auth.js config: no DB adapter, no Node-only imports.
// Used by `proxy.ts`, which runs on the Node.js runtime (Next 16 default)
// but only needs to decode the session JWT, never touch the database.
// The full DB-backed config lives in `./config.ts` and is used by API
// routes and RSC (Node runtime).
//
// Session strategy is JWT end-to-end. This is the correct Auth.js v5 pattern
// for edge-compatible middleware: sessions live in an encrypted cookie so the
// edge runtime can validate them without a DB round-trip. The DrizzleAdapter
// in `./config.ts` is still used at signin time to persist users + accounts.
export const edgeAuthConfig = {
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      // Safe because Google is the only OAuth provider and it asserts
      // verified emails; the Node sign-in gate (lib/auth/config.ts) also
      // requires `email_verified` and an invite. The flag protects against a
      // hostile IdP linking into an existing account, which cannot happen
      // with one trusted IdP. Turn it OFF if a second provider is ever added.
      // Without it, Auth.js throws OAuthAccountNotLinked when a users row
      // has this email but no accounts row (schema reset, orphaned account).
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // Non-sensitive scopes only (lib/google/scopes.ts): invitees never
          // grant Gmail or Calendar. The owner adds them once via "Connect
          // Gmail & Calendar"; include_granted_scopes keeps them afterwards.
          scope: BASE_SCOPES.join(' '),
          // Incremental authorization: the new token also covers scopes the
          // user granted before, so adding drive.file never drops Gmail.
          include_granted_scopes: 'true',
          // `offline` + `consent` are required for Google to return a durable
          // refresh_token. Without `prompt=consent`, subsequent authorizations
          // silently drop the refresh_token when the user has already granted
          // scope, and background sync stops working after ~1h.
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    // Never reached in practice: real sign-ins run through the Node config
    // (lib/auth/config.ts), whose invite gate replaces this. This instance
    // only decodes the JWT in proxy.ts; fail closed to the owner anyway.
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
