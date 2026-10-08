import * as cmpQ from '@/lib/db/queries/jobComparison'
import { logger } from '@/lib/logger'
import { loadSettings } from './service'
import { assumptionsSchema, currentJobSchema, type Assumptions, type CurrentJob } from './types'

/**
 * Saving the private comparison settings. Validation messages are
 * user-facing; the values themselves are never logged (only that a save
 * happened).
 */

export class CompareError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompareError'
  }
}

function firstIssue(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }): string {
  const i = error.issues[0]
  if (!i) return 'Check the form and try again.'
  const field = i.path.filter((p) => typeof p === 'string').join(' › ')
  return field ? `${field}: ${i.message}` : i.message
}

export async function saveCurrentJob(userId: string, input: unknown): Promise<CurrentJob> {
  const parsed = currentJobSchema.safeParse(input)
  if (!parsed.success) throw new CompareError(firstIssue(parsed.error))
  await cmpQ.save(userId, { currentJob: parsed.data })
  logger.info('current_job_saved')
  return parsed.data
}

export async function clearCurrentJob(userId: string): Promise<void> {
  await cmpQ.save(userId, { currentJob: null })
  logger.info('current_job_cleared')
}

function sameRates(a: Assumptions['fx']['rates'], b: Assumptions['fx']['rates']): boolean {
  return a.INR === b.INR && a.EUR === b.EUR && a.GBP === b.GBP
}

/** Save FX and place assumptions; changed rates stamp today's date. */
export async function saveAssumptions(userId: string, input: unknown, now: Date = new Date()): Promise<Assumptions> {
  const parsed = assumptionsSchema.safeParse(input)
  if (!parsed.success) throw new CompareError(firstIssue(parsed.error))
  const previous = (await loadSettings(userId)).assumptions
  const rates = parsed.data.fx.rates
  const anyRate = rates.INR !== null || rates.EUR !== null || rates.GBP !== null
  const stamp = !sameRates(previous.fx.rates, rates) || (anyRate && !parsed.data.fx.updatedAt)
  const next: Assumptions = {
    ...parsed.data,
    fx: {
      ...parsed.data.fx,
      updatedAt: stamp ? now.toISOString().slice(0, 10) : parsed.data.fx.updatedAt,
      source: anyRate ? parsed.data.fx.source : 'manual',
    },
  }
  await cmpQ.save(userId, { assumptions: next })
  logger.info('comparison_assumptions_saved')
  return next
}

export async function setFactorShortlist(userId: string, on: boolean): Promise<void> {
  await cmpQ.save(userId, { factorShortlist: on })
  logger.info('comparison_shortlist_factor', { on })
}
