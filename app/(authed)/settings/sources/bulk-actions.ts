'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { logger } from '@/lib/logger'
import { rateLimited } from '@/lib/tenancy/rate-limit'
import { checkSourcesNowFor, setSourcesEnabledFor, setWatchRemindersFor } from '@/lib/sources/bulk'
import { BULK_INLINE_POLLS } from '@/lib/queue/first-poll'

/**
 * Settings › Sources bulk actions (select many, then act). Validated with
 * zod, scoped to the caller's own sources (other ids are ignored), one
 * UPDATE each, and rate limited per user (action_throttle, `sourceBulk`).
 */

export type BulkActionResult = { success: true; message: string } | { error: string }

/** More than any account has; a bigger request is refused, not truncated. */
const MAX_BULK_IDS = 500

const idsSchema = z.array(z.string().uuid()).min(1).max(MAX_BULK_IDS)
const toggleSchema = z.object({ ids: idsSchema, enabled: z.boolean() }).strict()

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function pollsLine(queued: number, created: number): string {
  if (queued === 0) return 'already checked this hour'
  if (created === 0) return `already queued: ${plural(queued, 'check')}, one per source`
  const now = Math.min(queued, BULK_INLINE_POLLS)
  return `${plural(queued, 'check')} queued, ${now === queued ? 'running now' : `the first ${now} running now`}`
}

/** Shared guard: session, input, then one rate-limit use (only valid requests count). */
async function guard<T>(schema: z.ZodType<T>, input: unknown): Promise<{ userId: string; data: T } | { error: string }> {
  const userId = await requireUserId()
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { error: `Select between 1 and ${MAX_BULK_IDS} sources.` }
  const limited = await rateLimited(userId, 'sourceBulk')
  if (limited) return { error: limited }
  return { userId, data: parsed.data }
}

function failed(action: string, err: unknown, message: string): BulkActionResult {
  logger.error(`${action} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: message }
}

/** "Turn on N" / "Turn off N" on the selected polled sources. */
export async function setSourcesEnabled(ids: string[], enabled: boolean): Promise<BulkActionResult> {
  try {
    const g = await guard(toggleSchema, { ids, enabled })
    if ('error' in g) return g
    const r = await setSourcesEnabledFor(g.userId, g.data.ids, g.data.enabled)
    revalidatePath('/settings/sources')
    if (g.data.enabled) revalidatePath('/discoveries')
    const head = `Turned ${g.data.enabled ? 'on' : 'off'} ${plural(r.changed, 'source')}`
    const parts = [head]
    if (g.data.enabled && r.changed > 0) parts.push(pollsLine(r.queued, r.created))
    if (r.blocked > 0) parts.push(`${r.blocked} skipped (needs setup)`)
    return { success: true, message: parts.join(' · ') }
  } catch (err) {
    return failed('setSourcesEnabled', err, 'Could not update the sources.')
  }
}

/** "Check now": queue a poll for each selected source that is on. */
export async function checkSourcesNow(ids: string[]): Promise<BulkActionResult> {
  try {
    const g = await guard(z.object({ ids: idsSchema }).strict(), { ids })
    if ('error' in g) return g
    const r = await checkSourcesNowFor(g.userId, g.data.ids)
    revalidatePath('/settings/sources')
    if (r.checked === 0) return { success: true, message: 'Nothing to check: turn the sources on first' }
    return { success: true, message: `${plural(r.checked, 'source')}: ${pollsLine(r.queued, r.created)}` }
  } catch (err) {
    return failed('checkSourcesNow', err, 'Could not queue the checks.')
  }
}

/** Watch list: weekly reminders on or off for the selected links. */
export async function setWatchReminders(ids: string[], watching: boolean): Promise<BulkActionResult> {
  try {
    const g = await guard(z.object({ ids: idsSchema, watching: z.boolean() }).strict(), { ids, watching })
    if ('error' in g) return g
    const r = await setWatchRemindersFor(g.userId, g.data.ids, g.data.watching)
    revalidatePath('/settings/sources')
    return { success: true, message: `Weekly reminders ${g.data.watching ? 'on' : 'off'} for ${plural(r.changed, 'link')}` }
  } catch (err) {
    return failed('setWatchReminders', err, 'Could not update the watch list.')
  }
}
