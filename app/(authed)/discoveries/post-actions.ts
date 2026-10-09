'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import type { AIProvider } from '@/lib/ai/types'
import * as capturesQ from '@/lib/db/queries/postCaptures'
import { unavailableAi } from '@/lib/discovery/manual-import/no-ai'
import { importPost, PostImportError, postImportSchema } from '@/lib/linkedin-posts/import'
import { draftPostReply, ReplyError, type ReplyPlan } from '@/lib/linkedin-posts/reply-service'
import { trackHiringPost, TrackError } from '@/lib/linkedin-posts/track'
import { logger } from '@/lib/logger'

/**
 * LinkedIn hiring posts on Discovery: add a reviewed pasted / captured post,
 * draft a reply (the user copies and sends it; lee never messages anyone),
 * track it as an application, and discard a capture. Every action is scoped
 * to the signed-in user; Next's server actions reject cross-origin calls.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const UUID = z.string().uuid()

async function providerOrNull(userId: string): Promise<AIProvider | null> {
  try {
    return await getAIProviderForUser(userId)
  } catch {
    return null
  }
}

function fail(what: string, err: unknown, known: readonly (new (...a: never[]) => Error)[], fallback: string): { ok: false; error: string } {
  if (known.some((K) => err instanceof K)) return { ok: false, error: (err as Error).message }
  logger.error(`${what}_failed`, { err: err instanceof Error ? err.name : 'unknown' })
  return { ok: false, error: fallback }
}

export async function importPastedPostAction(input: unknown, captureId?: unknown): Promise<Result<{ discoveryId: string | null; duplicate: boolean; quarantined: boolean }>> {
  const parsed = postImportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the post details and try again.' }
  try {
    const userId = await requireUserId()
    const ai = (await providerOrNull(userId)) ?? unavailableAi('No AI key: scoring runs on the next discovery run.')
    const r = await importPost(userId, parsed.data, ai)
    if (UUID.safeParse(captureId).success) await capturesQ.remove(userId, captureId as string)
    revalidatePath('/discoveries')
    return { ok: true, ...r }
  } catch (err) {
    return fail('import_post', err, [PostImportError], 'Could not add that post. Try again.')
  }
}

export async function discardCaptureAction(captureId: unknown): Promise<Result> {
  if (!UUID.safeParse(captureId).success) return { ok: false, error: 'Nothing to discard.' }
  const userId = await requireUserId()
  await capturesQ.remove(userId, captureId as string)
  return { ok: true }
}

const replySchema = z.object({ discoveryId: UUID, channel: z.enum(['linkedin', 'email']).optional() })

export async function draftPostReplyAction(input: unknown): Promise<Result<{ plan: ReplyPlan }>> {
  const parsed = replySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick a hiring post.' }
  try {
    const userId = await requireUserId()
    const plan = await draftPostReply(userId, parsed.data.discoveryId, { channel: parsed.data.channel, ai: await providerOrNull(userId) })
    return { ok: true, plan }
  } catch (err) {
    return fail('draft_post_reply', err, [ReplyError], 'Could not draft the reply.')
  }
}

const trackSchema = z.object({ discoveryId: UUID, sent: z.boolean() })

export async function trackHiringPostAction(input: unknown): Promise<Result<{ applicationId: string; alreadyTracked: boolean }>> {
  const parsed = trackSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick a hiring post.' }
  try {
    const userId = await requireUserId()
    const r = await trackHiringPost(userId, parsed.data.discoveryId, { sent: parsed.data.sent })
    revalidatePath('/discoveries')
    revalidatePath('/applications')
    revalidatePath('/contacts')
    return { ok: true, applicationId: r.applicationId, alreadyTracked: r.alreadyTracked }
  } catch (err) {
    return fail('track_post', err, [TrackError], 'Could not track that post.')
  }
}
