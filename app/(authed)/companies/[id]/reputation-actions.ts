'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { withAiUsage } from '@/lib/ai/usage'
import type { AiUsage } from '@/lib/ai/usage-types'
import { logger } from '@/lib/logger'
import { ReputationError } from '@/lib/reputation/errors'
import { checkGoogleRating, type PlaceRating } from '@/lib/reputation/places'
import { removeRating, saveRating } from '@/lib/reputation/ratings'
import { refreshNow } from '@/lib/reputation/schedule'
import { clearSummary, confirmSummary, draftSummary } from '@/lib/reputation/summary'
import { REVIEW_SITES, type SummaryDraft } from '@/lib/reputation/types'

export type ReputationActionResult = { success: true; message?: string } | { error: string }

const idSchema = z.string().uuid()

function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof ReputationError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: fallback }
}

function revalidate(companyId: string): void {
  revalidatePath(`/companies/${companyId}`)
}

/** Refresh the company's signals now (queue job, drained right away). */
export async function refreshReputationAction(companyId: string): Promise<ReputationActionResult> {
  const parsed = idSchema.safeParse(companyId)
  if (!parsed.success) return { error: 'Invalid company.' }
  try {
    const userId = await requireUserId()
    const r = await refreshNow(userId, parsed.data)
    revalidate(parsed.data)
    if (r.status === 'recent') return { error: 'Already refreshed this hour — try again later.' }
    if (r.status === 'queued') return { success: true, message: 'Queued — it finishes on the next background run.' }
    return r.failed
      ? { error: 'The refresh failed. See the source status below.' }
      : { success: true, message: 'Signals refreshed.' }
  } catch (err) {
    return fail('refreshReputation', err, 'Could not refresh right now.')
  }
}

export type DraftResult = { success: true; draft: SummaryDraft; usage: AiUsage | null } | { error: string }

/** On-demand AI draft. Nothing is saved until the user confirms. */
export async function draftReputationSummaryAction(companyId: string): Promise<DraftResult> {
  const parsed = idSchema.safeParse(companyId)
  if (!parsed.success) return { error: 'Invalid company.' }
  try {
    const userId = await requireUserId()
    const ai = await getAIProviderForUser(userId)
    const { result, usage } = await withAiUsage({ userId }, () => draftSummary(userId, parsed.data, ai))
    return { success: true, draft: result, usage }
  } catch (err) {
    return fail('draftReputationSummary', err, 'Could not draft a summary. Check Settings › AI.')
  }
}

export async function confirmReputationSummaryAction(
  companyId: string,
  draft: SummaryDraft,
): Promise<ReputationActionResult> {
  const parsed = idSchema.safeParse(companyId)
  if (!parsed.success) return { error: 'Invalid company.' }
  try {
    const userId = await requireUserId()
    await confirmSummary(userId, parsed.data, draft)
    revalidate(parsed.data)
    return { success: true, message: 'Summary saved.' }
  } catch (err) {
    return fail('confirmReputationSummary', err, 'Could not save the summary.')
  }
}

export async function clearReputationSummaryAction(companyId: string): Promise<ReputationActionResult> {
  const parsed = idSchema.safeParse(companyId)
  if (!parsed.success) return { error: 'Invalid company.' }
  try {
    const userId = await requireUserId()
    await clearSummary(userId, parsed.data)
    revalidate(parsed.data)
    return { success: true, message: 'Summary removed.' }
  } catch (err) {
    return fail('clearReputationSummary', err, 'Could not remove the summary.')
  }
}

export async function saveReputationRatingAction(
  companyId: string,
  formData: FormData,
): Promise<ReputationActionResult> {
  const parsed = idSchema.safeParse(companyId)
  if (!parsed.success) return { error: 'Invalid company.' }
  try {
    const userId = await requireUserId()
    const site = String(formData.get('site') ?? '')
    if (!(REVIEW_SITES as readonly string[]).includes(site)) return { error: 'Pick a site.' }
    await saveRating(userId, parsed.data, {
      site: site as (typeof REVIEW_SITES)[number],
      rating: Number(formData.get('rating')),
      summary: String(formData.get('summary') ?? ''),
      url: String(formData.get('url') ?? ''),
    })
    revalidate(parsed.data)
    return { success: true, message: 'Rating saved.' }
  } catch (err) {
    return fail('saveReputationRating', err, 'Could not save the rating.')
  }
}

export async function removeReputationRatingAction(companyId: string, site: string): Promise<ReputationActionResult> {
  const parsed = idSchema.safeParse(companyId)
  const siteParsed = z.enum(REVIEW_SITES).safeParse(site)
  if (!parsed.success || !siteParsed.success) return { error: 'Invalid rating.' }
  try {
    const userId = await requireUserId()
    await removeRating(userId, parsed.data, siteParsed.data)
    revalidate(parsed.data)
    return { success: true, message: 'Rating removed.' }
  } catch (err) {
    return fail('removeReputationRating', err, 'Could not remove the rating.')
  }
}

export type GoogleRatingResult = { success: true; place: PlaceRating; callsUsed: number } | { error: string }

/** Live Google rating (never stored). Counts against the monthly cap. */
export async function checkGoogleRatingAction(companyId: string): Promise<GoogleRatingResult> {
  const parsed = idSchema.safeParse(companyId)
  if (!parsed.success) return { error: 'Invalid company.' }
  try {
    const userId = await requireUserId()
    const r = await checkGoogleRating(userId, parsed.data)
    if (!r.ok) return { error: r.message }
    return { success: true, place: r.place, callsUsed: r.callsUsed }
  } catch (err) {
    return fail('checkGoogleRating', err, 'Could not reach Google Places.')
  }
}
