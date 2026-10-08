'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { logger } from '@/lib/logger'
import { fetchEcbRates, type FetchedRates } from '@/lib/compare/fx-fetch'
import { clearCurrentJob, CompareError, saveAssumptions, saveCurrentJob, setFactorShortlist } from '@/lib/compare/settings'

export type CompareActionResult = { success: true; message?: string } | { error: string }

/** Friendly message out; only the error's kind (never values) to the server log. */
function fail(what: string, err: unknown, fallback: string): { error: string } {
  if (err instanceof CompareError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.name : 'unknown' })
  return { error: fallback }
}

function revalidate(): void {
  revalidatePath('/settings/profile/current-job')
  revalidatePath('/compare')
}

export async function saveCurrentJobAction(input: unknown): Promise<CompareActionResult> {
  try {
    const userId = await requireUserId()
    await saveCurrentJob(userId, input)
    revalidate()
    return { success: true, message: 'Current job saved. It stays private.' }
  } catch (err) {
    return fail('saveCurrentJob', err, 'Could not save your current job.')
  }
}

export async function clearCurrentJobAction(): Promise<CompareActionResult> {
  try {
    const userId = await requireUserId()
    await clearCurrentJob(userId)
    revalidate()
    return { success: true, message: 'Current job removed.' }
  } catch (err) {
    return fail('clearCurrentJob', err, 'Could not remove your current job.')
  }
}

export async function saveAssumptionsAction(input: unknown): Promise<CompareActionResult> {
  try {
    const userId = await requireUserId()
    await saveAssumptions(userId, input)
    revalidate()
    return { success: true, message: 'Assumptions saved.' }
  } catch (err) {
    return fail('saveAssumptions', err, 'Could not save the assumptions.')
  }
}

export async function setFactorShortlistAction(on: boolean): Promise<CompareActionResult> {
  try {
    const userId = await requireUserId()
    await setFactorShortlist(userId, on === true)
    revalidate()
    return {
      success: true,
      message: on ? 'The shortlist factors in your current job from its next build.' : 'The shortlist ignores the comparison again.',
    }
  } catch (err) {
    return fail('setFactorShortlist', err, 'Could not change the setting.')
  }
}

export type FetchRatesResult = { success: true; rates: FetchedRates } | { error: string }

/** Suggest ECB reference rates (Frankfurter, free, keyless); the user reviews and saves them. */
export async function fetchRatesAction(): Promise<FetchRatesResult> {
  try {
    await requireUserId()
    return { success: true, rates: await fetchEcbRates() }
  } catch (err) {
    return fail('fetchRates', err, 'Could not fetch rates right now. Enter them yourself.')
  }
}
