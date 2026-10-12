import { and, eq, inArray } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE } from './scope-names'

/**
 * Google scopes per feature (invite-beta spec §3.3). Sign-in asks only for
 * the non-sensitive BASE_SCOPES, so invitees never see Google's
 * "unverified app" screen and never grant Gmail. The owner adds the
 * sensitive / restricted OWNER_SCOPES once through "Connect Gmail &
 * Calendar" (lib/google/connect-actions.ts); `include_granted_scopes` keeps
 * those grants on every later sign-in.
 */

export * from './scope-names'

export function parseScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? '').split(/\s+/).filter(Boolean))
}

/** Granted Google scopes per user (accounts.scope is not a secret; tokens are). */
export async function googleScopesByUser(userIds: readonly string[], client: DbClient = db): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (userIds.length === 0) return out
  const rows = await client
    .select({ userId: accounts.userId, scope: accounts.scope })
    .from(accounts)
    .where(and(eq(accounts.provider, 'google'), inArray(accounts.userId, [...userIds])))
  for (const r of rows) out.set(r.userId, parseScopes(r.scope))
  return out
}

export interface GmailAccess {
  read: boolean
  send: boolean
}

/**
 * Gmail is owner-only in the beta: an invitee never gets Gmail jobs, even
 * with a stray grant. `isOwner` comes from lib/auth/owner.ts.
 */
export function gmailAccess(scopes: ReadonlySet<string> | undefined, isOwner: boolean): GmailAccess {
  if (!isOwner || !scopes) return { read: false, send: false }
  return { read: scopes.has(GMAIL_READ_SCOPE), send: scopes.has(GMAIL_SEND_SCOPE) }
}
