'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { withAiUsage } from '@/lib/ai/usage'
import * as profileQ from '@/lib/db/queries/profile'
import { saveProfile } from '@/lib/profile/service'
import { queueRelevanceReevaluation } from '@/lib/discovery/relevance/enqueue'
import { refreshMatchesAfterSave } from '@/lib/discovery/match/enqueue'
import { searchPrefsPatch } from '@/lib/discovery/relevance/form'
import { refineSuggestionsWithAI } from '@/lib/discovery/relevance/refine'
import { ROLE_FAMILY_IDS, resolveRoleFamily } from '@/lib/discovery/relevance/roles'
import { loadMasterCv, reevaluateRelevance, relevanceProgress } from '@/lib/discovery/relevance/service'
import { suggestRoles, type RoleSuggestion } from '@/lib/discovery/relevance/suggest'
import { logger } from '@/lib/logger'

export type SearchPrefsResult =
  | { success: true; evaluated: number; filtered: number; pending: boolean; total: number }
  | { error: string }

/** Inline re-evaluation budget; the rest runs in the queued job. */
const INLINE_BUDGET_MS = 4_000

function revalidate(): void {
  revalidatePath('/settings/profile')
  revalidatePath('/discoveries')
  revalidatePath('/')
}

/**
 * Re-gate the inbox right away (bounded), then hand anything left to the
 * queue so a large inbox never blocks the save.
 */
async function reapply(userId: string): Promise<{ evaluated: number; filtered: number; pending: boolean; total: number }> {
  const r = await reevaluateRelevance(userId, { deadline: Date.now() + INLINE_BUDGET_MS })
  if (r.remaining) await queueRelevanceReevaluation(userId)
  const left = r.remaining ? (await relevanceProgress(userId)).remaining : 0
  return { evaluated: r.evaluated, filtered: r.filtered, pending: r.remaining, total: r.evaluated + left }
}

export async function saveSearchPrefsAction(formData: FormData): Promise<SearchPrefsResult> {
  try {
    const userId = await requireUserId()
    const existing = await profileQ.get(userId)
    await saveProfile(userId, searchPrefsPatch(formData, existing))
    const applied = await reapply(userId)
    await refreshMatchesAfterSave(userId)
    revalidate()
    return { success: true, ...applied }
  } catch (err) {
    logger.error('saveSearchPrefs failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save your search preferences.' }
  }
}

/**
 * The defaults banner's one-click confirm: save search preferences with the
 * role families the user ticked (the provisional ones lee suggested), keeping
 * everything else as it is.
 */
export async function confirmDefaultPrefsAction(families: string[]): Promise<SearchPrefsResult> {
  try {
    const picked = Array.isArray(families) ? families.filter((f) => ROLE_FAMILY_IDS.includes(f)).slice(0, 20) : []
    if (picked.length === 0) return { error: 'Pick at least one kind of role.' }
    const userId = await requireUserId()
    const profile = await profileQ.get(userId)
    const custom = (profile?.roleTypes ?? []).filter((r) => resolveRoleFamily(r) === null)
    await saveProfile(userId, { roleTypes: [...new Set([...picked, ...custom])], searchPrefsSavedAt: new Date() })
    const applied = await reapply(userId)
    await refreshMatchesAfterSave(userId)
    revalidate()
    revalidatePath('/shortlist')
    return { success: true, ...applied }
  } catch (err) {
    logger.error('confirmDefaultPrefs failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save your search preferences.' }
  }
}

/** Turn filtering off: every filtered posting returns to the inbox. */
export async function clearSearchPrefsAction(): Promise<SearchPrefsResult> {
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { searchPrefsSavedAt: null })
    const applied = await reapply(userId)
    revalidate()
    return { success: true, ...applied }
  } catch (err) {
    logger.error('clearSearchPrefs failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not turn off filtering.' }
  }
}

export type SuggestionActionResult = { success: true } | { error: string }

/** Accept a suggestion: its family joins the target roles (nothing else changes). */
export async function acceptRoleSuggestionAction(family: string): Promise<SuggestionActionResult> {
  try {
    if (!ROLE_FAMILY_IDS.includes(family)) return { error: 'Unknown role.' }
    const userId = await requireUserId()
    const profile = await profileQ.get(userId)
    const current = profile?.roleTypes ?? []
    if (!current.some((r) => resolveRoleFamily(r) === family)) {
      await saveProfile(userId, { roleTypes: [...current, family] })
      if (profile?.searchPrefsSavedAt) await reapply(userId)
    }
    revalidate()
    return { success: true }
  } catch (err) {
    logger.error('acceptRoleSuggestion failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not add the role.' }
  }
}

const SUGGESTION_ID = /^[a-z_]{2,40}$/

/** Dismiss a suggestion for good. */
export async function dismissRoleSuggestionAction(id: string): Promise<SuggestionActionResult> {
  try {
    if (!SUGGESTION_ID.test(id)) return { error: 'Unknown suggestion.' }
    const userId = await requireUserId()
    const profile = await profileQ.get(userId)
    const dismissed = profile?.dismissedRoleSuggestions ?? []
    if (!dismissed.includes(id)) await saveProfile(userId, { dismissedRoleSuggestions: [...dismissed, id] })
    revalidate()
    return { success: true }
  } catch (err) {
    logger.error('dismissRoleSuggestion failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not dismiss the suggestion.' }
  }
}

export type RefineActionResult =
  | { success: true; suggestions: RoleSuggestion[] }
  | { skipped: true; message: string; fixHint?: string }
  | { error: string }

/**
 * "Refine with AI": optional, on click only (saves the free quota). With no
 * AI key or a thin profile it degrades to a friendly skip message.
 */
export async function refineRoleSuggestionsAction(): Promise<RefineActionResult> {
  try {
    const userId = await requireUserId()
    const [profile, masterCv] = await Promise.all([profileQ.get(userId), loadMasterCv(userId)])
    const base = suggestRoles({ profile, masterCv })
    let ai
    try {
      ai = await getAIProviderForUser(userId)
    } catch {
      return { skipped: true, message: 'AI refinement needs an AI key.', fixHint: 'Add one in Settings › AI.' }
    }
    const { result: r } = await withAiUsage({ userId }, () =>
      refineSuggestionsWithAI({ userId, ai, profile, masterCv, base }),
    )
    if (!r.ok) return { skipped: true, message: r.message, fixHint: r.fixHint }
    return { success: true, suggestions: r.suggestions }
  } catch (err) {
    logger.error('refineRoleSuggestions failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'AI suggestions are unavailable right now.' }
  }
}
