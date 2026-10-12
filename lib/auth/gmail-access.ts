import { isOwner } from './owner'

/**
 * SERVER-ONLY. Whether Gmail features can work for this account at all.
 * Invite-beta policy: invitees sign in with Google WITHOUT the Gmail scopes
 * (no restricted-scope review), so Gmail stays owner-only. Surfaces that
 * nag about a missing Gmail connection check this first: telling an invitee
 * to "Connect Gmail" is a dead end.
 */
export async function gmailAvailable(userId: string): Promise<boolean> {
  return isOwner(userId)
}
