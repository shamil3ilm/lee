'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { AISkippedError } from '@/lib/ai/signal'
import { withAiUsage } from '@/lib/ai/usage'
import { logger } from '@/lib/logger'
import { parseOpportunityKey } from '@/lib/compare/inputs'
import { clearNarrative, confirmNarrative, draftNarrative, type NarrativeDraft } from '@/lib/compare/narrative'
import { CompareError } from '@/lib/compare/settings'
import { savePastedJd } from '@/lib/compare/paste-jd'
import { z } from 'zod'

const uuid = z.string().uuid()

/** Paste a job description for a discovery with little or none. */
export async function pasteJdAction(discoveryId: string, text: string): Promise<NarrativeActionResult> {
  const id = uuid.safeParse(discoveryId)
  if (!id.success) return { error: 'Invalid posting.' }
  try {
    const userId = await requireUserId()
    await savePastedJd(userId, id.data, text)
    revalidatePath(`/discoveries/${id.data}`)
    revalidatePath('/compare')
    return { success: true, message: 'Job description saved. The comparison now reads it.' }
  } catch (err) {
    return fail('pasteJd', err, 'Could not save the job description.')
  }
}

export type NarrativeDraftResult =
  | { success: true; draft: NarrativeDraft }
  | { skipped: true; message: string; fixHint?: string }
  | { error: string }

export type NarrativeActionResult = { success: true; message: string } | { error: string }

function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof CompareError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.name : 'unknown' })
  return { error: fallback }
}

function validKey(key: string): string | null {
  const p = parseOpportunityKey(key)
  return p ? key.trim().toLowerCase() : null
}

function revalidate(key: string): void {
  const p = parseOpportunityKey(key)
  if (!p) return
  revalidatePath(p.kind === 'discovery' ? `/discoveries/${p.id}` : `/applications/${p.id}`)
  revalidatePath('/compare')
}

/** On-demand AI narrative; nothing is saved until the user confirms. */
export async function draftNarrativeAction(key: string): Promise<NarrativeDraftResult> {
  const k = validKey(key)
  if (!k) return { error: 'Invalid job.' }
  try {
    const userId = await requireUserId()
    const ai = await getAIProviderForUser(userId)
    const { result } = await withAiUsage({ userId }, () => draftNarrative(userId, k, ai))
    return { success: true, draft: result }
  } catch (err) {
    if (err instanceof AISkippedError) return { skipped: true, message: err.message, fixHint: err.fixHint }
    return fail('draftComparisonNarrative', err, 'Could not draft a narrative. Check Settings › AI.')
  }
}

export async function confirmNarrativeAction(key: string, draft: NarrativeDraft): Promise<NarrativeActionResult> {
  const k = validKey(key)
  if (!k) return { error: 'Invalid job.' }
  try {
    const userId = await requireUserId()
    await confirmNarrative(userId, k, draft)
    revalidate(k)
    return { success: true, message: 'Narrative saved.' }
  } catch (err) {
    return fail('confirmComparisonNarrative', err, 'Could not save the narrative.')
  }
}

export async function clearNarrativeAction(key: string): Promise<NarrativeActionResult> {
  const k = validKey(key)
  if (!k) return { error: 'Invalid job.' }
  try {
    const userId = await requireUserId()
    await clearNarrative(userId, k)
    revalidate(k)
    return { success: true, message: 'Narrative removed.' }
  } catch (err) {
    return fail('clearComparisonNarrative', err, 'Could not remove the narrative.')
  }
}
