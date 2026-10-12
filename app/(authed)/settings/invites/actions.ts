'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { NotOwnerError, isOwner, requireOwner } from '@/lib/auth/owner'
import { logger } from '@/lib/logger'
import { createInvite, revokeInvite } from '@/lib/tenancy/invites'
import { setUserStatus } from '@/lib/tenancy/access'
import { checkRate, rateLimitMessage } from '@/lib/tenancy/rate-limit'
import { BETA_INVITEE_CAP } from '@/lib/tenancy/limits'

export type InviteActionResult = { success: true; message: string } | { error: string }

const PATH = '/settings/invites'

function fail(err: unknown, label: string): InviteActionResult {
  if (err instanceof NotOwnerError) return { error: err.message }
  logger.error(`${label} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: 'Something went wrong. Try again.' }
}

const REASONS: Record<string, string> = {
  invalid_email: 'That does not look like an email address.',
  owner: 'That is your own (owner) email.',
  has_access: 'That person already has an account.',
  suspended: 'That account is suspended. Reactivate it in the Users list instead.',
  already_invited: 'That email already has a pending invite.',
  cap_reached: `The beta is full (${BETA_INVITEE_CAP} invitees). Revoke an invite first.`,
}

const inviteSchema = z.object({ email: z.string().max(254), note: z.string().max(200).optional() })

/** Owner: invite an email (valid 30 days). */
export async function createInviteAction(input: { email: string; note?: string }): Promise<InviteActionResult> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid request.' }
  try {
    const ownerId = await requireOwner()
    const rate = await checkRate(ownerId, 'invite')
    if (!rate.allowed) return { error: rateLimitMessage('invite', rate) }
    const r = await createInvite(ownerId, parsed.data.email, parsed.data.note ?? null)
    if (!r.ok) return { error: REASONS[r.reason] ?? 'Could not create the invite.' }
    revalidatePath(PATH)
    return { success: true, message: `Invited ${r.email}. They can sign in with Google at /signin.` }
  } catch (err) {
    return fail(err, 'createInvite')
  }
}

/** Owner: revoke an invite (an accepted one also suspends that account). */
export async function revokeInviteAction(inviteId: string): Promise<InviteActionResult> {
  if (!z.string().uuid().safeParse(inviteId).success) return { error: 'Invalid request.' }
  try {
    await requireOwner()
    const r = await revokeInvite(inviteId)
    if (!r.ok) return { error: r.reason === 'not_found' ? 'Invite not found.' : 'Already revoked.' }
    revalidatePath(PATH)
    return { success: true, message: r.suspendedUser ? 'Invite revoked and the account suspended.' : 'Invite revoked.' }
  } catch (err) {
    return fail(err, 'revokeInvite')
  }
}

/** Owner: suspend or reactivate a member account (never the owner). */
export async function setMemberStatusAction(userId: string, status: 'active' | 'suspended'): Promise<InviteActionResult> {
  if (!z.string().uuid().safeParse(userId).success || (status !== 'active' && status !== 'suspended')) {
    return { error: 'Invalid request.' }
  }
  try {
    await requireOwner()
    if (await isOwner(userId)) return { error: 'The owner account cannot be suspended.' }
    if (!(await setUserStatus(userId, status))) return { error: 'User not found.' }
    revalidatePath(PATH)
    return { success: true, message: status === 'suspended' ? 'Account suspended; it is signed out on its next request.' : 'Account reactivated.' }
  } catch (err) {
    return fail(err, 'setMemberStatus')
  }
}
