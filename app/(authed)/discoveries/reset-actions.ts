'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { resetDiscoveries } from '@/lib/discovery/reset'
import { queueRefetch } from '@/lib/discovery/reset-refetch'
import { logger } from '@/lib/logger'

/** "Reset discoveries" from Discovery's overflow menu or Settings › Storage. */

const inputSchema = z.object({
  sourceIds: z.array(z.string().uuid()).max(200).default([]),
  includeShortlisted: z.boolean().default(false),
  allowReimport: z.boolean().default(true),
  resetLearned: z.boolean().default(false),
  refetch: z.boolean().default(true),
})

export type ResetInput = z.input<typeof inputSchema>
export type ResetActionResult =
  | { success: true; deleted: number; tombstoned: number; remaining: boolean; refetching: number }
  | { error: string }

/** Stay well inside the function's time limit; the reset is idempotent, so a rerun finishes it. */
const RESET_BUDGET_MS = 8_000

export async function resetDiscoveriesAction(input: ResetInput): Promise<ResetActionResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { error: 'Those reset options are not valid.' }
  try {
    const userId = await requireUserId()
    const o = parsed.data
    const r = await resetDiscoveries(
      userId,
      { sourceIds: o.sourceIds, includeShortlisted: o.includeShortlisted, allowReimport: o.allowReimport, resetLearned: o.resetLearned },
      { deadline: Date.now() + RESET_BUDGET_MS },
    )
    const refetching = o.refetch && !r.remaining ? await queueRefetch(userId, o.sourceIds) : 0
    revalidatePath('/discoveries')
    revalidatePath('/shortlist')
    revalidatePath('/settings/storage')
    revalidatePath('/')
    return { success: true, ...r, refetching }
  } catch (err) {
    logger.error('resetDiscoveries failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not reset your discoveries.' }
  }
}
