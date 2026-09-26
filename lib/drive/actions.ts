'use server'

import { signIn } from '@/lib/auth'

/**
 * "Connect Google Drive" / "Reconnect Google Drive": re-run the Google
 * consent with the full scope list (drive.file included) and
 * include_granted_scopes, then come back to `returnTo`. Signing in again as
 * the same Google account keeps the same Employ user; the signIn event
 * (lib/auth/config.ts) stores the new tokens and scope on the account row.
 */
export async function connectDriveAction(returnTo: string): Promise<void> {
  // Only same-site paths: never an open redirect.
  const safe = typeof returnTo === 'string' && /^\/(?![/\\])/.test(returnTo) ? returnTo : '/settings/integrations'
  await signIn('google', { redirectTo: safe }, { include_granted_scopes: 'true', prompt: 'consent' })
}
