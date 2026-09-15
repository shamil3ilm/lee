'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import {
  deleteCompany as svcDeleteCompany,
  removeFromWatchlist as svcRemoveFromWatchlist,
  setInterestLevel as svcSetInterestLevel,
  setStance as svcSetStance,
  updateCompanyDetails,
} from '@/lib/companies/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

function revalidate(id: string): void {
  revalidatePath(`/companies/${id}`)
  revalidatePath('/companies')
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().min(1).nullable().optional(),
  website: z.string().url().nullable().optional().or(z.literal('')),
  headquartersCity: z.string().nullable().optional(),
  headquartersCountry: z.string().length(2).nullable().optional().or(z.literal('')),
  size: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
  notesMd: z.string().nullable().optional(),
})

/**
 * Accept a FormData patch and update whichever fields were provided. Empty
 * strings collapse to null so the user can clear values from the edit form.
 */
export async function updateCompany(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const raw = Object.fromEntries(formData)
    const parsed = updateSchema.safeParse(raw)
    if (!parsed.success) return { error: 'Invalid company details.' }
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue
      patch[k] = v === '' ? null : v
    }
    const updated = await updateCompanyDetails(userId, id, patch)
    if (!updated) return { error: 'Company not found.' }
    revalidate(id)
    return { success: true }
  } catch (err) {
    logger.error('updateCompany failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not update company.' }
  }
}

export async function setInterestLevel(id: string, level: number): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const updated = await svcSetInterestLevel(userId, id, level)
    if (!updated) return { error: 'Company not found.' }
    revalidate(id)
    return { success: true }
  } catch (err) {
    logger.error('setInterestLevel failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update interest.' }
  }
}

export async function setStance(id: string, stance: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const updated = await svcSetStance(userId, id, stance)
    if (!updated) return { error: 'Company not found.' }
    revalidate(id)
    return { success: true }
  } catch (err) {
    logger.error('setStance failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not update stance.' }
  }
}

export async function removeFromWatchlist(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const updated = await svcRemoveFromWatchlist(userId, id)
    if (!updated) return { error: 'Company not found.' }
    revalidate(id)
    return { success: true }
  } catch (err) {
    logger.error('removeFromWatchlist failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update company.' }
  }
}

/**
 * Delete + redirect. Server actions can't return-and-redirect cleanly, so we
 * throw the redirect after the toast is delivered by the caller (result is
 * returned first when redirect fails, e.g. company already gone).
 */
export async function deleteCompany(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const ok = await svcDeleteCompany(userId, id)
    if (!ok) return { error: 'Company not found.' }
    revalidatePath('/companies')
  } catch (err) {
    logger.error('deleteCompany failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not delete company.' }
  }
  redirect('/companies')
}
