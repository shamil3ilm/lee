import { z } from 'zod'
import * as cmpQ from '@/lib/db/queries/jobComparison'
import { logger } from '@/lib/logger'
import { saveJd } from '@/lib/discovery/match/jd-service'
import { MIN_JD_CHARS } from './jd'
import { CompareError } from './settings'

/**
 * "Paste the JD" for a discovery whose source gave little or no description.
 * Stored on the discovery (discoveries.pasted_jd) and read by the comparison
 * before the source's own description. Only the length is logged.
 */

export const MAX_JD_CHARS = 20_000

const pasteSchema = z
  .string()
  .trim()
  .min(MIN_JD_CHARS, `Paste the full description (at least ${MIN_JD_CHARS} characters).`)
  .max(MAX_JD_CHARS, `Keep it under ${MAX_JD_CHARS.toLocaleString('en-US')} characters.`)

export async function savePastedJd(userId: string, discoveryId: string, text: unknown): Promise<void> {
  const parsed = pasteSchema.safeParse(text)
  if (!parsed.success) throw new CompareError(parsed.error.issues[0]?.message ?? 'Paste the job description.')
  const changed = await cmpQ.setPastedJd(userId, discoveryId, parsed.data)
  if (changed === 0) throw new CompareError('That posting was not found.')
  logger.info('discovery_jd_pasted', { chars: parsed.data.length })
  // Same stored JD feeds the Match Score: re-score and re-gate it now.
  await saveJd(userId, discoveryId, parsed.data, 'pasted').catch((err: unknown) => {
    logger.warn('discovery_jd_rescore_failed', { err: err instanceof Error ? err.name : 'unknown' })
  })
}
