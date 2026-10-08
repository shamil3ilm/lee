'use server'
import { plural } from '@/lib/ui/labels'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { AISkippedError } from '@/lib/ai/signal'
import { withAiUsage } from '@/lib/ai/usage'
import type { AiUsage } from '@/lib/ai/usage-types'
import * as itemsQ from '@/lib/db/queries/radarItems'
import { saveProfile } from '@/lib/profile/service'
import { logger } from '@/lib/logger'
import { confirmBrief } from '@/lib/radar/brief/confirm'
import { draftBrief } from '@/lib/radar/brief/draft'
import { learnThis } from '@/lib/radar/brief/module'
import type { BriefDraft, BriefModule } from '@/lib/radar/brief/types'
import { RadarError } from '@/lib/radar/errors'
import { refreshRadarNow } from '@/lib/radar/schedule'
import { RADAR_SOURCES } from '@/lib/radar/types'
import { addTerm, editTerm, removeTerm, setTermMuted } from '@/lib/radar/watch'
import * as profileQ from '@/lib/db/queries/profile'

export type RadarActionResult = { success: true; message?: string } | { error: string }

const idSchema = z.string().uuid()

function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof RadarError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: fallback }
}

function revalidateRadar(entryId?: string): void {
  revalidatePath('/radar', 'layout')
  if (entryId) revalidatePath(`/radar/${entryId}`)
}

function termFrom(formData: FormData): { term: string; aliases: string[]; kind: string } {
  return {
    term: String(formData.get('term') ?? ''),
    aliases: String(formData.get('aliases') ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    kind: String(formData.get('kind') ?? 'term'),
  }
}

export async function addWatchTermAction(formData: FormData): Promise<RadarActionResult> {
  try {
    const userId = await requireUserId()
    const t = await addTerm(userId, termFrom(formData))
    revalidateRadar()
    return { success: true, message: `Watching “${t.term}”.` }
  } catch (err) {
    return fail('addWatchTerm', err, 'Could not add the term.')
  }
}

export async function editWatchTermAction(id: string, formData: FormData): Promise<RadarActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Invalid term.' }
  try {
    const userId = await requireUserId()
    await editTerm(userId, id, termFrom(formData))
    revalidateRadar()
    return { success: true, message: 'Term saved.' }
  } catch (err) {
    return fail('editWatchTerm', err, 'Could not save the term.')
  }
}

export async function muteWatchTermAction(id: string, muted: boolean): Promise<RadarActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Invalid term.' }
  try {
    const userId = await requireUserId()
    await setTermMuted(userId, id, muted)
    revalidateRadar()
    return { success: true, message: muted ? 'Term muted.' : 'Term unmuted.' }
  } catch (err) {
    return fail('muteWatchTerm', err, 'Could not change the term.')
  }
}

export async function removeWatchTermAction(id: string): Promise<RadarActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Invalid term.' }
  try {
    const userId = await requireUserId()
    await removeTerm(userId, id)
    revalidateRadar()
    return { success: true, message: 'Term removed.' }
  } catch (err) {
    return fail('removeWatchTerm', err, 'Could not remove the term.')
  }
}

export async function setEntryFlagAction(id: string, flag: 'read' | 'saved', on: boolean): Promise<RadarActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Invalid entry.' }
  try {
    const userId = await requireUserId()
    const value = on ? new Date() : null
    const ok = await itemsQ.setEntryFlags(userId, id, flag === 'read' ? { readAt: value } : { savedAt: value })
    if (!ok) return { error: 'That entry is gone.' }
    revalidateRadar(id)
    return { success: true }
  } catch (err) {
    return fail('setEntryFlag', err, 'Could not update the entry.')
  }
}

export async function refreshRadarAction(): Promise<RadarActionResult> {
  try {
    const userId = await requireUserId()
    const r = await refreshRadarNow(userId)
    revalidateRadar()
    if (r.status === 'no_terms') return { error: 'Watch at least one term first.' }
    if (r.status === 'recent') return { error: 'Already refreshed this hour — try again later.' }
    if (r.status === 'queued') return { success: true, message: 'Queued — it finishes on the next background run.' }
    return { success: true, message: r.failed > 0 ? `Refreshed; ${plural(r.failed, 'source')} failed.` : 'Radar refreshed.' }
  } catch (err) {
    return fail('refreshRadar', err, 'Could not refresh right now.')
  }
}

export async function setRadarSourceAction(source: string, on: boolean): Promise<RadarActionResult> {
  const parsed = z.enum(RADAR_SOURCES).safeParse(source)
  if (!parsed.success) return { error: 'Unknown source.' }
  try {
    const userId = await requireUserId()
    const current = (await profileQ.get(userId))?.radarSourcesOff ?? []
    const next = on ? current.filter((s) => s !== parsed.data) : [...new Set([...current, parsed.data])]
    await saveProfile(userId, { radarSourcesOff: next })
    revalidateRadar()
    return { success: true }
  } catch (err) {
    return fail('setRadarSource', err, 'Could not change the source.')
  }
}

export type BriefDraftResult =
  | { success: true; draft: BriefDraft; usage: AiUsage | null }
  | { skipped: true; message: string; fixHint: string | null }
  | { error: string }

/** On-demand draft; nothing is saved until the user confirms. */
export async function draftBriefAction(entryId: string): Promise<BriefDraftResult> {
  if (!idSchema.safeParse(entryId).success) return { error: 'Invalid entry.' }
  try {
    const userId = await requireUserId()
    const ai = await getAIProviderForUser(userId)
    const { result, usage } = await withAiUsage({ userId }, () => draftBrief(userId, entryId, ai))
    return { success: true, draft: result, usage }
  } catch (err) {
    if (err instanceof AISkippedError) return { skipped: true, message: err.message, fixHint: err.fixHint ?? null }
    return fail('draftBrief', err, 'Could not draft a brief. Check Settings › AI.')
  }
}

export async function confirmBriefAction(draft: BriefDraft, removed: unknown): Promise<RadarActionResult> {
  try {
    const userId = await requireUserId()
    const row = await confirmBrief(userId, draft, removed)
    revalidateRadar(row.entryId)
    return { success: true, message: 'Brief saved.' }
  } catch (err) {
    return fail('confirmBrief', err, 'Could not save the brief.')
  }
}

export type LearnResult = { success: true; module: BriefModule } | { error: string }

export async function learnThisAction(entryId: string): Promise<LearnResult> {
  if (!idSchema.safeParse(entryId).success) return { error: 'Invalid entry.' }
  try {
    const userId = await requireUserId()
    const mod = await learnThis(userId, entryId)
    revalidateRadar(entryId)
    revalidatePath('/playground/review')
    return { success: true, module: mod }
  } catch (err) {
    return fail('learnThis', err, 'Could not add it to the Playground.')
  }
}
