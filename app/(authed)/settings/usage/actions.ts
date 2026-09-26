'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { db } from '@/lib/db/client'
import { usageSettings } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { utcPeriod } from '@/lib/usage/meters'
import { isNeonProjectId } from '@/lib/usage/neon-api'
import { claimRefreshSlot, takeUsageSnapshot } from '@/lib/usage/snapshot'
import { clearThrottleCache } from '@/lib/usage/throttle'

export type UsageActionResult = { success: true; message: string } | { error: string }

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * "Refresh now": take today's snapshot (vendor calls included) at most once
 * per 10 minutes per user. Only counts and a friendly line reach the client.
 */
export async function refreshUsageAction(): Promise<UsageActionResult> {
  try {
    const userId = await requireUserId()
    if (!(await claimRefreshSlot(userId))) {
      return { error: 'Refreshed a few minutes ago. Try again in a little while.' }
    }
    const r = await takeUsageSnapshot()
    revalidatePath('/settings/usage')
    const neon = r.neonConnected ? ' Neon usage updated.' : ''
    return { success: true, message: `Usage refreshed.${neon}` }
  } catch (err) {
    logger.error('refreshUsage failed', { err: errMessage(err) })
    return { error: 'Could not refresh usage right now.' }
  }
}

const projectSchema = z
  .string()
  .trim()
  .max(64)
  .refine((v) => v === '' || isNeonProjectId(v), 'That does not look like a Neon project id (e.g. "cool-sun-123456").')

/** Save (or clear, with '') the Neon project id the snapshot reads. */
export async function saveNeonProjectAction(projectId: string): Promise<UsageActionResult> {
  const parsed = projectSchema.safeParse(projectId)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid project id.' }
  try {
    const userId = await requireUserId()
    const now = new Date()
    const value = parsed.data === '' ? null : parsed.data
    await db
      .insert(usageSettings)
      .values({ userId, neonProjectId: value, updatedAt: now })
      .onConflictDoUpdate({ target: usageSettings.userId, set: { neonProjectId: value, updatedAt: now } })
    revalidatePath('/settings/usage')
    return {
      success: true,
      message: value ? 'Project id saved. It is used from the next refresh.' : 'Project id cleared: it is discovered from the key.',
    }
  } catch (err) {
    logger.error('saveNeonProject failed', { err: errMessage(err) })
    return { error: 'Could not save the project id.' }
  }
}

/**
 * Resume paused jobs for the rest of this UTC month despite a ≥90% meter
 * (resume = true), or let the automatic throttle apply again (false).
 */
export async function setThrottlesResumedAction(resume: boolean): Promise<UsageActionResult> {
  if (typeof resume !== 'boolean') return { error: 'Invalid request.' }
  try {
    const userId = await requireUserId()
    const now = new Date()
    const period = resume ? utcPeriod(now) : null
    await db
      .insert(usageSettings)
      .values({ userId, throttlesResumedPeriod: period, updatedAt: now })
      .onConflictDoUpdate({ target: usageSettings.userId, set: { throttlesResumedPeriod: period, updatedAt: now } })
    clearThrottleCache()
    revalidatePath('/settings/usage')
    return {
      success: true,
      message: resume
        ? 'Paused jobs resume for the rest of this month.'
        : 'Automatic throttling is back on.',
    }
  } catch (err) {
    logger.error('setThrottlesResumed failed', { err: errMessage(err) })
    return { error: 'Could not change the throttle.' }
  }
}
