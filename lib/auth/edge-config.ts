import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'
import { env } from '@/lib/env'
import { isAllowedEmail } from './allowed-email'

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
      // Safe here because we have exactly one provider (Google) and one
      // ALLOWED_EMAIL gate — the security concern the flag protects against
      // (a hostile IdP linking to an existing password account) can't happen.
      // Without this, Auth.js throws OAuthAccountNotLinked when an existing
      // users row has this email but no matching accounts row (e.g. after a
      // schema reset, adapter mid-migration, or scope-change re-consent that
      // orphaned the previous account row).
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            // v4: needed to send the weekly digest from the user's own mailbox
            // via lib/gmail/send.ts. Existing users must re-consent on next
            // sign-in — the `prompt=consent` below already forces that.
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/calendar.events',
            // A2: Google Drive as the file store. drive.file is per-file
            // (only files lee creates or the user picks) and
            // non-sensitive. Existing sessions keep working without it;
            // Drive features show "Connect Google Drive", which re-runs this
            // consent (lib/drive/actions.ts). Keep in sync with DRIVE_FILE_SCOPE.
            'https://www.googleapis.com/auth/drive.file',
          ].join(' '),
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
