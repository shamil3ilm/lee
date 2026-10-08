import { loadAcademyContent } from '@/lib/academy/content/catalog'
import * as bestQ from '@/lib/db/queries/bestCv'
import { rowToJob } from '@/lib/discovery/match/service'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { logger } from '@/lib/logger'
import type { Region } from '@/lib/variants/types'
import { fitContext, fitsFor } from './context'
import { loadFitSource } from './service'
import { recurringGaps, type RecurringGap } from './study'
import { playgroundSkills } from './tailor/gaps'

/**
 * Settings › Variants bulk view: the user's open postings × variants with
 * each variant's fit, which CV is best for which jobs, and the missing
 * must-haves that keep recurring this month (as study suggestions).
 * Computed on request from the same deterministic scorer; nothing stored.
 */

export const MATRIX_ROWS = 20
export const GAP_WINDOW_DAYS = 30

export interface MatrixView {
  variants: Array<{ id: string; name: string; region: Region }>
  rows: Array<{ discoveryId: string; title: string; company: string; fits: Array<number | null>; best: string | null }>
  /** Jobs each variant is the best CV for, by variant id. */
  bestCounts: Record<string, number>
  gaps: Array<RecurringGap & { playground: string[] }>
}

function graph() {
  try {
    return loadAcademyContent().graph
  } catch (err) {
    logger.warn('matrix_playground_graph_failed', { err: err instanceof Error ? err.message : String(err) })
    return null
  }
}

export async function loadMatrix(userId: string, now: Date = new Date()): Promise<MatrixView> {
  const since = new Date(now.getTime() - GAP_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [src, open, missing] = await Promise.all([loadFitSource(userId), bestQ.openForMatrix(userId, MATRIX_ROWS), bestQ.missingSince(userId, since)])
  const ctx = fitContext(src.profile, src.variants, now)
  const variants = src.variants.map((v) => ({ id: v.id, name: v.name, region: v.region }))
  const bestCounts: Record<string, number> = Object.fromEntries(variants.map((v) => [v.id, 0]))
  const rows = open.map((r) => {
    const fits = fitsFor(ctx, rowToJob(r))
    const byId = new Map(fits.map((f) => [f.variantId, f.fit] as const))
    const best = fits[0]?.variantId ?? null
    if (best) bestCounts[best] = (bestCounts[best] ?? 0) + 1
    return {
      discoveryId: r.id,
      title: repairMojibake(r.title ?? 'Untitled'),
      company: repairMojibake(r.companyName ?? 'Unknown company'),
      fits: variants.map((v) => byId.get(v.id) ?? null),
      best,
    }
  })
  const g = graph()
  const gaps = recurringGaps(missing).map((gap) => ({ ...gap, playground: playgroundSkills(g, gap.label, gap.label) }))
  return { variants, rows, bestCounts, gaps }
}
