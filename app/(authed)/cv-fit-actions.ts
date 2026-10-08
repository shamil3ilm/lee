'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { confirmVariant, PrepareError, startPrepare } from '@/lib/apply/prepare'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import { refreshMatchesAfterSave } from '@/lib/discovery/match/enqueue'
import { switchToPhotoVersion } from '@/lib/cv-fit/photo/service'
import { addStudySkill } from '@/lib/cv-fit/study'
import { addGapToStudyList, saveTailoredCopy } from '@/lib/cv-fit/tailor/save'
import { previewTailor, TailorError } from '@/lib/cv-fit/tailor/service'
import type { ChecklistItem, TailorOutcome } from '@/lib/cv-fit/tailor/types'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { chooseVariantForApplication, createStarterVariants, VariantError } from '@/lib/variants/service'
import { REGIONS } from '@/lib/variants/types'
import { logger } from '@/lib/logger'

/**
 * Best CV per job, Tailor to this JD and Photo advice. Every action checks
 * the session, validates its input and only ever acts on the user's own
 * rows; nothing is applied without the user's click.
 */

type Result<T = object> = ({ success: true } & T) | { error: string }

const uuid = z.string().uuid()

function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof TailorError || err instanceof VariantError || err instanceof PrepareError || err instanceof ResumeValidationError) {
    return { error: err.message }
  }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: fallback }
}

function refresh(applicationId?: string): void {
  revalidatePath('/shortlist')
  revalidatePath('/discoveries')
  if (applicationId) {
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath(`/applications/${applicationId}/prepare`)
  }
}

/** "Use this CV" on a discovery: start preparing it with that variant. */
export async function chooseBestCvForDiscoveryAction(discoveryId: string, variantId: string): Promise<Result<{ applicationId: string }>> {
  if (!uuid.safeParse(discoveryId).success || !uuid.safeParse(variantId).success) return { error: 'Invalid choice.' }
  try {
    const userId = await requireUserId()
    const { applicationId } = await startPrepare(userId, { discoveryId })
    await confirmVariant(userId, applicationId, variantId)
    refresh(applicationId)
    revalidatePath('/applications')
    return { success: true, applicationId }
  } catch (err) {
    return fail('useBestCvDiscovery', err, 'Could not use this CV.')
  }
}

/** "Use this CV" on an application: record the variant (and finish Prepare step 1 when preparing). */
export async function chooseBestCvForApplicationAction(applicationId: string, variantId: string): Promise<Result> {
  if (!uuid.safeParse(applicationId).success || !uuid.safeParse(variantId).success) return { error: 'Invalid choice.' }
  try {
    const userId = await requireUserId()
    if (await prepsQ.get(userId, applicationId)) await confirmVariant(userId, applicationId, variantId)
    else await chooseVariantForApplication(userId, applicationId, variantId)
    refresh(applicationId)
    return { success: true }
  } catch (err) {
    return fail('useBestCvApplication', err, 'Could not use this CV.')
  }
}

export async function switchToPhotoVersionAction(applicationId: string): Promise<Result<{ name: string; created: boolean }>> {
  if (!uuid.safeParse(applicationId).success) return { error: 'Application not found.' }
  try {
    const userId = await requireUserId()
    const r = await switchToPhotoVersion(userId, applicationId)
    if (r.created) await refreshMatchesAfterSave(userId)
    refresh(applicationId)
    revalidatePath('/settings/variants')
    return { success: true, name: r.name, created: r.created }
  } catch (err) {
    return fail('switchToPhotoVersion', err, 'Could not switch to the photo version.')
  }
}

const idList = z.array(z.string().min(1).max(120)).max(60)
const wordings = z.array(z.object({ highlightId: z.string().min(1).max(40), text: z.string().min(1).max(2000) })).max(20).default([])
const gaps = z.array(z.object({ requirementId: z.string().min(1).max(20), action: z.enum(['study', 'cover', 'ignore']) })).max(40).default([])

export async function previewTailorAction(
  applicationId: string,
  input: unknown,
): Promise<Result<{ outcome: TailorOutcome & { checklist: ChecklistItem[] } }>> {
  const parsed = z.object({ accepted: idList, wordings }).safeParse(input)
  if (!uuid.safeParse(applicationId).success || !parsed.success) return { error: 'Invalid selection.' }
  try {
    const userId = await requireUserId()
    const outcome = await previewTailor(userId, applicationId, parsed.data.accepted, parsed.data.wordings)
    return { success: true, outcome }
  } catch (err) {
    return fail('previewTailor', err, 'Could not preview the tailored CV.')
  }
}

export async function saveTailoredCopyAction(applicationId: string, input: unknown): Promise<Result<{ documentId: string; version: number }>> {
  const parsed = z.object({ accepted: idList, wordings, gaps }).safeParse(input)
  if (!uuid.safeParse(applicationId).success || !parsed.success) return { error: 'Invalid selection.' }
  try {
    const userId = await requireUserId()
    const r = await saveTailoredCopy(userId, applicationId, parsed.data)
    if (parsed.data.wordings.length > 0) await refreshMatchesAfterSave(userId)
    refresh(applicationId)
    revalidatePath('/documents')
    return { success: true, documentId: r.documentId, version: r.version }
  } catch (err) {
    return fail('saveTailoredCopy', err, 'Could not save the tailored copy.')
  }
}

export async function addGapToStudyAction(applicationId: string, requirementId: string): Promise<Result<{ label: string; created: boolean }>> {
  if (!uuid.safeParse(applicationId).success || !/^r[0-9a-f]{8}$/.test(requirementId)) return { error: 'Invalid requirement.' }
  try {
    const userId = await requireUserId()
    const r = await addGapToStudyList(userId, applicationId, requirementId)
    refresh(applicationId)
    revalidatePath('/settings/study')
    return { success: true, ...r }
  } catch (err) {
    return fail('addGapToStudy', err, 'Could not add it to your study list.')
  }
}

/** Settings › Variants: a recurring gap → the study list. */
export async function addStudyLabelAction(label: string): Promise<Result<{ created: boolean }>> {
  const parsed = z.string().trim().min(1).max(120).safeParse(label)
  if (!parsed.success) return { error: 'Nothing to add.' }
  try {
    const userId = await requireUserId()
    const { profile } = await getResumeProfile(userId)
    const r = addStudySkill(profile, parsed.data, 'A missing must-have that keeps coming up in your discoveries.')
    if (!r.ok) return { error: r.error }
    if (r.created) await saveResumeProfile(userId, r.profile)
    revalidatePath('/settings/study')
    revalidatePath('/settings/variants')
    return { success: true, created: r.created }
  } catch (err) {
    return fail('addStudyLabel', err, 'Could not add it to your study list.')
  }
}

const starterPicks = z.array(z.object({ roleId: z.string().min(1).max(60), region: z.enum(REGIONS) })).min(1).max(30)

export async function createStarterSetAction(input: unknown): Promise<Result<{ created: number }>> {
  const parsed = starterPicks.safeParse(input)
  if (!parsed.success) return { error: 'Pick at least one variant to create.' }
  try {
    const userId = await requireUserId()
    const rows = await createStarterVariants(userId, parsed.data)
    if (rows.length > 0) await refreshMatchesAfterSave(userId)
    revalidatePath('/settings/variants')
    refresh()
    return { success: true, created: rows.length }
  } catch (err) {
    return fail('createStarterSet', err, 'Could not create the variants.')
  }
}
