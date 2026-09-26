'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { AssessmentNotFoundError, setUserVerdict } from '@/lib/scam/service'
import { isQuarantined } from '@/lib/scam/view'
import { logger } from '@/lib/logger'

export type VerdictResult = { success: true; quarantined: boolean } | { error: string }

const verdictSchema = z.object({
  targetType: z.enum(['discovery', 'job']),
  targetId: z.string().uuid(),
  verdict: z.enum(['not_scam', 'confirmed_scam']).nullable(),
})

/**
 * v17 §1 — the user's Scam Shield decision. "not_scam" un-quarantines and
 * allow-lists the posting's domain/company; "confirmed_scam" keeps it in
 * quarantine; null clears the verdict. Nothing is ever deleted.
 */
export async function setScamVerdict(
  targetType: 'discovery' | 'job',
  targetId: string,
  verdict: 'not_scam' | 'confirmed_scam' | null,
): Promise<VerdictResult> {
  const parsed = verdictSchema.safeParse({ targetType, targetId, verdict })
  if (!parsed.success) return { error: 'Invalid request.' }
  try {
    const userId = await requireUserId()
    const row = await setUserVerdict(userId, parsed.data.targetType, parsed.data.targetId, parsed.data.verdict)
    revalidatePath('/discoveries')
    revalidatePath('/')
    revalidatePath('/applications', 'layout')
    return { success: true, quarantined: isQuarantined(row) }
  } catch (err) {
    if (err instanceof AssessmentNotFoundError) return { error: 'This item no longer exists.' }
    logger.error('setScamVerdict failed', {
      targetType,
      targetId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save your decision.' }
  }
}
