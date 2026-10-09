'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { previewCompanyReset, resetCompanies, type CompanyResetCounts } from '@/lib/company-discovery/reset'
import { enqueueCompanyDiscoveryAfterReset } from '@/lib/company-discovery/schedule'
import { logger } from '@/lib/logger'

/** "Reset companies" from Discovery › Companies' overflow menu. */

const optionsSchema = z.object({
  keepWatched: z.boolean().default(true),
  includeOwn: z.boolean().default(false),
})

const inputSchema = optionsSchema.extend({
  runNow: z.boolean().default(true),
  /** Typed confirmation, required when watched companies go too. */
  confirm: z.string().max(20).default(''),
})

export type CompanyResetInput = z.input<typeof inputSchema>
export type CompanyResetPreview = { counts: CompanyResetCounts } | { error: string }
export type CompanyResetActionResult = { success: true; deleted: number; remaining: boolean; queued: boolean } | { error: string }

/** Same budget as the jobs reset; a rerun finishes what is left. */
const RESET_BUDGET_MS = 8_000

export async function previewCompanyResetAction(input: z.input<typeof optionsSchema>): Promise<CompanyResetPreview> {
  const parsed = optionsSchema.safeParse(input)
  if (!parsed.success) return { error: 'Those reset options are not valid.' }
  try {
    return { counts: await previewCompanyReset(await requireUserId(), parsed.data) }
  } catch (err) {
    logger.error('previewCompanyReset failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { error: 'Could not count your companies.' }
  }
}

export async function resetCompaniesAction(input: CompanyResetInput): Promise<CompanyResetActionResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { error: 'Those reset options are not valid.' }
  const o = parsed.data
  if (!o.keepWatched && o.confirm.trim() !== 'RESET') return { error: 'Type RESET to remove the companies you watch too.' }
  try {
    const userId = await requireUserId()
    const r = await resetCompanies(userId, { keepWatched: o.keepWatched, includeOwn: o.includeOwn }, { deadline: Date.now() + RESET_BUDGET_MS })
    const queued = o.runNow && !r.remaining ? await enqueueCompanyDiscoveryAfterReset(userId) : false
    revalidatePath('/discoveries')
    revalidatePath('/settings/storage')
    return { success: true, ...r, queued }
  } catch (err) {
    logger.error('resetCompanies failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { error: 'Could not reset your companies.' }
  }
}
