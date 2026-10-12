'use server'

import { signIn } from '@/lib/auth'
import { requireOwner } from '@/lib/auth/owner'
import { OWNER_SCOPES } from './scope-names'

/**
 * Owner only: "Connect Gmail & Calendar". Re-runs Google consent with the
 * sensitive/restricted scopes (Gmail read and send, Calendar events) on top
 * of the sign-in ones, then returns to Settings › Invites. Invitees never reach
 * this: Gmail stays owner-only in the beta (spec §3.3).
 */
export async function connectGoogleWorkspaceAction(): Promise<void> {
  await requireOwner()
  await signIn(
    'google',
    { redirectTo: '/settings/invites' },
    { scope: OWNER_SCOPES.join(' '), include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent' },
  )
}
