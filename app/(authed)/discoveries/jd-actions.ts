'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { fetchAndSaveJd, JD_MAX_CHARS, saveJd } from '@/lib/discovery/match/jd-service'
import { logger } from '@/lib/logger'

/**
 * "Paste the JD to score properly" / "Fetch the full JD" on a title-only
 * discovery: store the JD, re-score and re-gate the row.
 */

export type JdActionResult = { success: true; score: number } | { error: string }

const idSchema = z.string().uuid()
const textSchema = z.string().max(JD_MAX_CHARS * 2)

function done(r: Awaited<ReturnType<typeof saveJd>>): JdActionResult {
  if (!r.ok) return { error: r.error }
  revalidatePath('/discoveries')
  revalidatePath('/shortlist')
  return { success: true, score: r.score }
}

export async function pasteJdAction(discoveryId: string, text: string): Promise<JdActionResult> {
  const id = idSchema.safeParse(discoveryId)
  const body = textSchema.safeParse(text)
  if (!id.success || !body.success) return { error: 'That JD could not be saved.' }
  try {
    const userId = await requireUserId()
    return done(await saveJd(userId, id.data, body.data, 'pasted'))
  } catch (err) {
    logger.error('pasteJd failed', { discoveryId, err: err instanceof Error ? err.message : String(err) })
    return { error: 'That JD could not be saved.' }
  }
}

export async function fetchJdAction(discoveryId: string): Promise<JdActionResult> {
  const id = idSchema.safeParse(discoveryId)
  if (!id.success) return { error: 'Could not fetch the JD.' }
  try {
    const userId = await requireUserId()
    return done(await fetchAndSaveJd(userId, id.data))
  } catch (err) {
    logger.error('fetchJd failed', { discoveryId, err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not fetch the JD. Paste it instead.' }
  }
}
