import { isOwner } from '@/lib/auth/owner'
import { gmailAccess, googleScopesByUser, type GmailAccess } from '@/lib/google/scopes'
import { listServiceSecretStatuses } from '@/lib/settings/secrets'
import type { SourceSetup } from './readiness'

/**
 * SERVER-ONLY. What the user has set up that some sources need: Gmail read
 * access (owner-only in the beta) and an Adzuna key (saved, or the owner's
 * env key). No secret is decrypted: the masked key statuses are enough.
 */
export async function loadSourceSetup(userId: string): Promise<SourceSetup & { gmail: GmailAccess }> {
  const [owner, scopes, secrets] = await Promise.all([isOwner(userId), googleScopesByUser([userId]), listServiceSecretStatuses(userId)])
  const gmail = gmailAccess(scopes.get(userId), owner)
  const adzuna = secrets.find((s) => s.info.id === 'adzuna')
  return { gmail, gmailRead: gmail.read, adzunaKey: Boolean(adzuna && adzuna.source !== 'none') }
}
