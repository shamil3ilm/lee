'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as newQ from '@/lib/db/queries/radarNew'
import { logger } from '@/lib/logger'
import { saveProfile } from '@/lib/profile/service'
import { RadarError } from '@/lib/radar/errors'
import { cleanTerm } from '@/lib/radar/match'
import { adoptWhatsNew } from '@/lib/radar/new/adopt'
import { cleanProjectIds } from '@/lib/radar/new/projects'
import { addTerm } from '@/lib/radar/watch'

/** Radar › What's new: Watch this, Save, Brief & learn, and the release list. */

export type NewActionResult = { success: true; message?: string; entryId?: string } | { error: string }

const idSchema = z.string().uuid()

function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof RadarError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: fallback }
}

/** "Watch this": the entry's name becomes a watch term (the user's Radar then searches for it daily). */
export async function watchWhatsNewAction(id: string): Promise<NewActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Invalid item.' }
  try {
    const userId = await requireUserId()
    const entry = await newQ.getEntry(id)
    if (!entry) return { error: 'That item is no longer listed.' }
    const term = cleanTerm(entry.name).slice(0, 80)
    const row = await addTerm(userId, { term, aliases: [], kind: 'entity' })
    logger.info('radar_new_action', { action: 'watched' })
    revalidatePath('/radar', 'layout')
    return { success: true, message: `Watching “${row.term}”.` }
  } catch (err) {
    return fail('watchWhatsNew', err, 'Could not add the watch term.')
  }
}

/** "Save" (save: true) or "Brief & learn": open it in the user's own Radar, then the entry page. */
export async function openWhatsNewAction(id: string, save: boolean): Promise<NewActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Invalid item.' }
  try {
    const userId = await requireUserId()
    const entryId = await adoptWhatsNew(userId, id, { save })
    logger.info('radar_new_action', { action: save ? 'saved' : 'opened' })
    revalidatePath('/radar', 'layout')
    return { success: true, entryId, ...(save ? { message: 'Saved to your Radar.' } : {}) }
  } catch (err) {
    return fail('openWhatsNew', err, 'Could not open it in your Radar.')
  }
}

/** The release list; null goes back to the list derived from the profile. */
export async function setReleaseProjectsAction(ids: string[] | null): Promise<NewActionResult> {
  try {
    const userId = await requireUserId()
    const next = ids === null ? null : cleanProjectIds(Array.isArray(ids) ? ids : [])
    await saveProfile(userId, { radarReleaseProjects: next })
    logger.info('radar_new_action', { action: ids === null ? 'releases_reset' : 'releases_edited' })
    revalidatePath('/radar', 'layout')
    return { success: true, message: ids === null ? 'Back to the list from your profile.' : 'Release list saved.' }
  } catch (err) {
    return fail('setReleaseProjects', err, 'Could not save the release list.')
  }
}
