'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { logger } from '@/lib/logger'
import { clearOrphans, pullPortfolio, type PullOutcome } from '@/lib/portfolio/pull'

type Result<T = object> = ({ success: true } & T) | { error: string }

function revalidate(): void {
  revalidatePath('/settings', 'layout')
  revalidatePath('/documents')
}

/** "Sync now": read the portfolio's profile.json and apply it (no throttle). */
export async function syncPortfolioAction(): Promise<Result<{ outcome: PullOutcome }>> {
  try {
    const userId = await requireUserId()
    const outcome = await pullPortfolio(userId, { trigger: 'manual', ignoreThrottle: true, reapply: true })
    revalidate()
    return { success: true, outcome }
  } catch (err) {
    logger.error('syncPortfolio failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { error: 'Could not sync from your portfolio. Please try again.' }
  }
}

const orphanIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional()

/** Clear one orphaned overlay entry (by item id), or all of them. */
export async function clearOrphansAction(id?: unknown): Promise<Result<{ cleared: number }>> {
  try {
    const userId = await requireUserId()
    const parsed = orphanIdSchema.safeParse(id ?? undefined)
    if (!parsed.success) return { error: 'Invalid item.' }
    const cleared = await clearOrphans(userId, parsed.data)
    revalidatePath('/settings/publish')
    return { success: true, cleared }
  } catch (err) {
    logger.error('clearOrphans failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { error: 'Could not clear the list. Please try again.' }
  }
}
