'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { buildShortlistForUser } from '@/lib/apply/shortlist'
import { later, notForMe, TriageError } from '@/lib/apply/triage'
import { isDismissReason } from '@/lib/apply/feedback'
import { confirmVariant, PrepareError, saveChecklist, skipStep, startPrepare } from '@/lib/apply/prepare'
import { markApplied } from '@/lib/apply/applied'
import { completeFollowup } from '@/lib/apply/followups'
import { PREPARE_STEPS, type PrepareStep } from '@/lib/apply/progress'
import { applySettingsSchema } from '@/lib/apply/settings'
import { VariantError } from '@/lib/variants/service'
import { saveProfile } from '@/lib/profile/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const id = z.string().uuid()

/** Known errors carry a user-facing message; anything else gets `fallback`. */
function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof PrepareError || err instanceof TriageError || err instanceof VariantError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: fallback }
}

function refreshPages(applicationId?: string): void {
  revalidatePath('/shortlist')
  revalidatePath('/')
  revalidatePath('/discoveries')
  if (applicationId) {
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath(`/applications/${applicationId}/prepare`)
  }
}

export async function refreshShortlistAction(): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await buildShortlistForUser(userId)
    refreshPages()
    return { success: true }
  } catch (err) {
    return fail('refreshShortlist', err, 'Could not refresh the shortlist.')
  }
}

export async function laterAction(discoveryId: string): Promise<ActionResult> {
  if (!id.safeParse(discoveryId).success) return { error: 'Posting not found.' }
  try {
    const userId = await requireUserId()
    await later(userId, discoveryId)
    refreshPages()
    return { success: true }
  } catch (err) {
    return fail('shortlistLater', err, 'Could not move it to later.')
  }
}

export async function notForMeAction(discoveryId: string, reason: string): Promise<ActionResult> {
  if (!id.safeParse(discoveryId).success) return { error: 'Posting not found.' }
  if (!isDismissReason(reason)) return { error: 'Pick a reason.' }
  try {
    const userId = await requireUserId()
    await notForMe(userId, discoveryId, reason)
    refreshPages()
    return { success: true }
  } catch (err) {
    return fail('shortlistNotForMe', err, 'Could not dismiss it.')
  }
}

export async function prepareAction(discoveryId: string): Promise<{ applicationId: string } | { error: string }> {
  if (!id.safeParse(discoveryId).success) return { error: 'Posting not found.' }
  try {
    const userId = await requireUserId()
    const { applicationId } = await startPrepare(userId, { discoveryId })
    refreshPages(applicationId)
    revalidatePath('/applications')
    return { applicationId }
  } catch (err) {
    return fail('prepareApplication', err, 'Could not start preparing this application.')
  }
}

/** "Prepare application" from an application page (no discovery involved). */
export async function startPrepareForApplicationAction(applicationId: string): Promise<ActionResult> {
  if (!id.safeParse(applicationId).success) return { error: 'Application not found.' }
  try {
    const userId = await requireUserId()
    await startPrepare(userId, { applicationId })
    refreshPages(applicationId)
    revalidatePath(`/applications/${applicationId}/prepare`)
    return { success: true }
  } catch (err) {
    return fail('prepareApplication', err, 'Could not start preparing this application.')
  }
}

export async function confirmVariantAction(applicationId: string, variantId: string | null): Promise<ActionResult> {
  if (!id.safeParse(applicationId).success || (variantId !== null && !id.safeParse(variantId).success)) {
    return { error: 'Invalid choice.' }
  }
  try {
    const userId = await requireUserId()
    await confirmVariant(userId, applicationId, variantId)
    refreshPages(applicationId)
    return { success: true }
  } catch (err) {
    return fail('prepareVariant', err, 'Could not save the variant.')
  }
}

export async function skipStepAction(applicationId: string, step: string): Promise<ActionResult> {
  if (!id.safeParse(applicationId).success || !(PREPARE_STEPS as readonly string[]).includes(step)) {
    return { error: 'Invalid step.' }
  }
  try {
    const userId = await requireUserId()
    await skipStep(userId, applicationId, step as PrepareStep)
    refreshPages(applicationId)
    return { success: true }
  } catch (err) {
    return fail('prepareSkip', err, 'Could not skip this step.')
  }
}

export async function saveChecklistAction(applicationId: string, checked: string[]): Promise<ActionResult> {
  if (!id.safeParse(applicationId).success || !Array.isArray(checked)) return { error: 'Invalid checklist.' }
  try {
    const userId = await requireUserId()
    await saveChecklist(userId, applicationId, checked.filter((c) => typeof c === 'string'), true)
    refreshPages(applicationId)
    return { success: true }
  } catch (err) {
    return fail('prepareChecklist', err, 'Could not save the checklist.')
  }
}

export async function markAppliedAction(applicationId: string, day: string): Promise<ActionResult> {
  if (!id.safeParse(applicationId).success) return { error: 'Application not found.' }
  try {
    const userId = await requireUserId()
    await markApplied(userId, applicationId, day)
    refreshPages(applicationId)
    revalidatePath('/applications')
    return { success: true }
  } catch (err) {
    return fail('markApplied', err, 'Could not mark it applied.')
  }
}

export async function completeFollowupAction(applicationId: string): Promise<ActionResult> {
  if (!id.safeParse(applicationId).success) return { error: 'Application not found.' }
  try {
    const userId = await requireUserId()
    await completeFollowup(userId, applicationId)
    refreshPages(applicationId)
    return { success: true }
  } catch (err) {
    return fail('completeFollowup', err, 'Could not update the follow-up.')
  }
}

export async function saveApplySettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = applySettingsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the values.' }
  try {
    const userId = await requireUserId()
    await saveProfile(userId, parsed.data)
    revalidatePath('/settings/notifications')
    revalidatePath('/shortlist')
    return { success: true }
  } catch (err) {
    return fail('saveApplySettings', err, 'Could not save the settings.')
  }
}
