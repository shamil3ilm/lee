'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as relQ from '@/lib/db/queries/discoveryRelevance'
import { learnFromDiscoveries, setLearnedTitle } from '@/lib/discovery/relevance/learn-service'
import { domainFilterReview } from '@/lib/discovery/relevance/review'
import { relevanceProgress } from '@/lib/discovery/relevance/service'
import { logger } from '@/lib/logger'

/**
 * Relevance housekeeping the user drives: re-check progress after a save,
 * "These are related" from the weekly review, and editing the titles lee
 * learned.
 */

export type ProgressResult = { remaining: number; filtered: number } | { error: string }
export type SimpleResult = { success: true; count?: number } | { error: string }

const keySchema = z.string().trim().min(1).max(80)

function refresh(): void {
  revalidatePath('/discoveries')
  revalidatePath('/settings/profile')
}

export async function relevanceProgressAction(): Promise<ProgressResult> {
  try {
    const userId = await requireUserId()
    return await relevanceProgress(userId)
  } catch (err) {
    logger.warn('relevanceProgress failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not read the re-check progress.' }
  }
}

/** Weekly review: restore every filtered posting with this title and learn it as related. */
export async function markTitlesRelatedAction(key: string): Promise<SimpleResult> {
  const k = keySchema.safeParse(key)
  if (!k.success) return { error: 'Unknown title.' }
  try {
    const userId = await requireUserId()
    const item = (await domainFilterReview(userId)).find((r) => r.key === k.data)
    if (!item) return { error: 'Those postings are no longer filtered.' }
    const count = await relQ.showAnyway(userId, item.ids)
    await learnFromDiscoveries(userId, item.ids, true)
    refresh()
    return { success: true, count }
  } catch (err) {
    logger.error('markTitlesRelated failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not restore those postings.' }
  }
}

/** Settings › Titles lee learned: mark related / unrelated, or forget (null). */
export async function setLearnedTitleAction(key: string, related: boolean | null): Promise<SimpleResult> {
  const k = keySchema.safeParse(key)
  if (!k.success || (related !== null && typeof related !== 'boolean')) return { error: 'Unknown title.' }
  try {
    const userId = await requireUserId()
    await setLearnedTitle(userId, k.data, related)
    refresh()
    return { success: true }
  } catch (err) {
    logger.error('setLearnedTitle failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not update that title.' }
  }
}
