'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { runNowForUser } from '@/lib/queue/overview'
import { retryDead } from '@/lib/queue/queue'
import { logger } from '@/lib/logger'

export type JobsActionResult = { success: true; message: string } | { error: string }

const idSchema = z.string().uuid()

/** Put one of the user's dead jobs back in the queue with fresh attempts. */
export async function retryJobAction(id: string): Promise<JobsActionResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { error: 'Invalid job.' }
  try {
    const userId = await requireUserId()
    if (!(await retryDead(userId, parsed.data))) return { error: 'That job can no longer be retried.' }
    revalidatePath('/settings/jobs')
    return { success: true, message: 'Queued — it runs on the next drain or when you press Run now.' }
  } catch (err) {
    logger.error('retryJob failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not retry the job.' }
  }
}

/** Drain the user's due jobs now, within a small budget. */
export async function runJobsNowAction(): Promise<JobsActionResult> {
  try {
    const userId = await requireUserId()
    const r = await runNowForUser(userId)
    revalidatePath('/settings/jobs')
    if (r.status === 'throttled') return { error: 'Just ran — try again in a few seconds.' }
    if (r.done === 0 && r.failed === 0) return { success: true, message: 'Nothing was due.' }
    const more = r.remaining === 'more' ? ' More remain; they run on the next drain.' : ''
    return { success: true, message: `Ran ${r.done + r.failed} job(s): ${r.done} done, ${r.failed} failed.${more}` }
  } catch (err) {
    logger.error('runJobsNow failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not run jobs right now.' }
  }
}
