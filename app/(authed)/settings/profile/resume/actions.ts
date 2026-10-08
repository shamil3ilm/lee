'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { logger } from '@/lib/logger'
import { refreshMatchesAfterSave } from '@/lib/discovery/match/enqueue'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { patchStudyItem, hasStudyTarget, type StudyPatch } from '@/lib/resume/study'
import { DEPTHS, DATE_PATTERN, type ResumeProfile } from '@/lib/resume/types'

export type SaveResumeResult = { success: true; profile: ResumeProfile; snapshot: boolean } | { error: string; problems?: string[] }

function revalidate(): void {
  revalidatePath('/settings/profile', 'layout')
  revalidatePath('/documents')
}

/** Save the whole master profile (validated, fact-locked, derived CV refreshed). */
export async function saveResumeAction(input: unknown): Promise<SaveResumeResult> {
  try {
    const userId = await requireUserId()
    const { profile, masterDocument } = await saveResumeProfile(userId, input)
    await refreshMatchesAfterSave(userId)
    revalidate()
    return { success: true, profile, snapshot: masterDocument !== null }
  } catch (err) {
    if (err instanceof ResumeValidationError) return { error: err.message, problems: err.problems }
    logger.error('saveResume failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save your profile.' }
  }
}

function cleanPatch(raw: StudyPatch): StudyPatch | null {
  const out: StudyPatch = {}
  if (raw.interviewReady !== undefined) out.interviewReady = raw.interviewReady === true
  if (raw.domainReady !== undefined) out.domainReady = raw.domainReady === true
  if (raw.depth !== undefined) {
    if (!(DEPTHS as readonly string[]).includes(raw.depth)) return null
    out.depth = raw.depth
  }
  if (raw.ownedAspects !== undefined) out.ownedAspects = String(raw.ownedAspects).slice(0, 300)
  if (raw.studyNotes !== undefined) out.studyNotes = String(raw.studyNotes).slice(0, 1000)
  if (raw.studyTarget !== undefined) {
    const t = String(raw.studyTarget)
    if (t && !DATE_PATTERN.test(t)) return null
    out.studyTarget = t
  }
  return out
}

/** Study list: patch one item's readiness / notes / target date. */
export async function patchStudyAction(id: string, raw: StudyPatch): Promise<{ success: true } | { error: string }> {
  try {
    const userId = await requireUserId()
    const patch = cleanPatch(raw)
    if (!patch) return { error: 'Invalid value.' }
    const { profile } = await getResumeProfile(userId)
    if (!hasStudyTarget(profile, id)) return { error: 'That item is no longer in your profile.' }
    await saveResumeProfile(userId, patchStudyItem(profile, id, patch))
    await refreshMatchesAfterSave(userId)
    revalidate()
    return { success: true }
  } catch (err) {
    if (err instanceof ResumeValidationError) return { error: err.message }
    logger.error('patchStudy failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not update the item.' }
  }
}
