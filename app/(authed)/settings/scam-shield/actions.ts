'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import {
  MESSAGING_HOSTS,
  URL_SHORTENERS,
  hostOf,
  isFreemail,
  isJobPlatform,
  normalizeCompanyName,
  registrableDomain,
} from '@/lib/scam/domains'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

/** v17 §1 — opt in/out of Scam Shield network checks (RDAP + DNS-over-HTTPS). */
export async function toggleScamNetChecksAction(enabled: boolean): Promise<ActionResult> {
  if (typeof enabled !== 'boolean') return { error: 'Invalid value.' }
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { scamNetChecks: enabled })
    revalidatePath('/settings/scam-shield')
    return { success: true }
  } catch (err) {
    logger.error('toggleScamNetChecks failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not update Scam Shield settings.' }
  }
}

const idSchema = z.string().uuid()

/**
 * Forget one allow-list entry. Items it released stay released until their
 * next re-assessment (a rules-version bump or a job edit).
 */
export async function removeAllowListEntryAction(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { error: 'Invalid entry.' }
  try {
    const userId = await requireUserId()
    const removed = await allowQ.remove(userId, parsed.data)
    if (!removed) return { error: 'Entry not found.' }
    revalidatePath('/settings/scam-shield')
    return { success: true }
  } catch (err) {
    logger.error('removeAllowListEntry failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not remove the entry.' }
  }
}

const addSchema = z.object({
  kind: z.enum(['domain', 'company']),
  value: z.string().trim().min(1, 'Enter a domain or company name.').max(200),
})

/**
 * Add a "trusted" domain or company by hand (the same memory a "not a scam"
 * verdict writes). Values are normalised exactly as verdicts store them.
 * Shared hosts — free mail, job boards, messaging apps, link shorteners —
 * are refused: trusting one would release every posting that uses it.
 * Takes effect on each item's next assessment.
 */
export async function addAllowListEntryAction(kind: string, value: string): Promise<ActionResult> {
  const parsed = addSchema.safeParse({ kind, value })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.path[0] === 'kind' ? 'Invalid entry type.' : (issue?.message ?? 'Invalid entry.') }
  }
  try {
    const userId = await requireUserId()
    let normalized: string
    if (parsed.data.kind === 'domain') {
      const host = hostOf(parsed.data.value)
      if (!host) return { error: 'Enter a domain like acme.com.' }
      if (isFreemail(host) || isJobPlatform(host) || MESSAGING_HOSTS.has(host) || URL_SHORTENERS.has(host)) {
        return { error: 'That is a shared host (email, job board or link service) and cannot be trusted as a whole.' }
      }
      normalized = registrableDomain(host)
    } else {
      normalized = normalizeCompanyName(parsed.data.value)
      if (!normalized) return { error: 'Enter a company name.' }
    }
    await allowQ.add(userId, parsed.data.kind, normalized)
    revalidatePath('/settings/scam-shield')
    return { success: true }
  } catch (err) {
    logger.error('addAllowListEntry failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not add the entry.' }
  }
}
