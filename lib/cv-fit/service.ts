import * as bestQ from '@/lib/db/queries/bestCv'
import * as variantsQ from '@/lib/db/queries/resumeVariants'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import { rowToJob } from '@/lib/discovery/match/service'
import type { MatchJob } from '@/lib/discovery/match/types'
import { getResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { recipeSchema, isRegion } from '@/lib/variants/types'
import { logger } from '@/lib/logger'
import { bestFor, fitContext, type FitContext, type VariantForFit } from './context'
import { applicationKey, bestCvKey } from './key'
import { toBestCv, type BestCv } from './types'

/**
 * Server side of "Best CV for each job". DB-only and AI-free:
 *   - the backfill (queue job `discovery-match:user`, and bounded on the
 *     Discovery view) recomputes in-play discoveries whose key moved;
 *   - pages that show a best CV fill their own rows on read (≤ a page);
 *   - an application computes its own on view, keyed with its JD.
 */

export async function loadVariantsForFit(userId: string): Promise<VariantForFit[]> {
  const rows = await variantsQ.listCurrentRecipes(userId)
  return rows.flatMap((r) => {
    const recipe = recipeSchema.safeParse(r.recipe)
    if (!recipe.success || !isRegion(r.region)) {
      logger.warn('best_cv_recipe_unreadable', { userId, variantId: r.id })
      return []
    }
    return [{ id: r.id, name: r.name, region: r.region, roleFamily: r.roleFamily, version: r.version, recipe: recipe.data }]
  })
}

/** The user's side, unrendered: enough for the key (cheap); render only when something is stale. */
export interface FitSource {
  profile: ResumeProfile
  variants: VariantForFit[]
  key: string
}

export async function loadFitSource(userId: string, opts: { profile?: ResumeProfile } = {}): Promise<FitSource> {
  const [profile, variants] = await Promise.all([
    opts.profile ? Promise.resolve(opts.profile) : getResumeProfile(userId).then((r) => r.profile),
    loadVariantsForFit(userId),
  ])
  return { profile, variants, key: bestCvKey(profile, variants) }
}

export async function loadFitContext(userId: string, opts: { profile?: ResumeProfile; now?: Date } = {}): Promise<FitContext> {
  const src = await loadFitSource(userId, opts)
  return fitContext(src.profile, src.variants, opts.now ?? new Date())
}

export interface BestCvBackfill {
  computed: number
  remaining: boolean
}

export const BEST_CV_BATCH = 200

/**
 * Recompute every in-play discovery whose `best_cv_key` is not the current
 * key, in batches (one read + one UPDATE each), until done, `deadline`
 * passes or `maxRows` were processed. Idempotent.
 */
export async function rescoreBestCv(
  userId: string,
  opts: { deadline?: number; maxRows?: number; now?: Date } = {},
): Promise<BestCvBackfill> {
  const src = await loadFitSource(userId)
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY
  // Rendered only once something is stale: the steady state costs one query.
  let ctx: FitContext | null = null
  let computed = 0
  for (;;) {
    if (Date.now() >= deadline || computed >= maxRows) return { computed, remaining: true }
    const rows = await bestQ.staleRows(userId, src.key, BEST_CV_BATCH)
    if (rows.length === 0) break
    const c = (ctx ??= fitContext(src.profile, src.variants, opts.now ?? new Date()))
    await bestQ.applyBatch(
      userId,
      rows.map((r) => ({ id: r.id, bestCv: bestFor(c, rowToJob(r)) })),
      src.key,
    )
    computed += rows.length
    if (rows.length < BEST_CV_BATCH) break
  }
  return { computed, remaining: false }
}

/** True when some in-play discovery carries a best CV from an older key. */
export async function bestCvStale(userId: string): Promise<boolean> {
  const src = await loadFitSource(userId)
  return bestQ.hasStale(userId, src.key)
}

/**
 * Fill the best CV of these discoveries when stale (a shortlist page, a
 * detail page). Returns the fresh values by id; rows already current are
 * not in the map (the caller reads them from its own row).
 */
export async function ensureBestCv(userId: string, ids: readonly string[], now: Date = new Date()): Promise<Map<string, BestCv | null>> {
  const out = new Map<string, BestCv | null>()
  if (ids.length === 0) return out
  const src = await loadFitSource(userId)
  const rows = await bestQ.staleAmong(userId, src.key, ids.slice(0, 50))
  if (rows.length === 0) return out
  const c = fitContext(src.profile, src.variants, now)
  const computed = rows.map((r) => ({ id: r.id, bestCv: bestFor(c, rowToJob(r)) }))
  await bestQ.applyBatch(userId, computed, c.key)
  for (const r of computed) out.set(r.id, r.bestCv)
  return out
}

export function applicationJob(app: Pick<ApplicationWithJob, 'job'>): MatchJob {
  const stack = (app.job.parsedMeta as { tech_stack?: unknown } | null)?.tech_stack
  return {
    title: app.job.title,
    location: app.job.location,
    remoteType: app.job.remoteType,
    employmentType: app.job.employmentType,
    descriptionMd: (app.job.descriptionMd ?? '').slice(0, 8_000),
    techStack: Array.isArray(stack) ? stack.filter((s): s is string => typeof s === 'string') : [],
  }
}

/** The application's best CV: the stored one while its key holds, else computed and stored. */
export async function bestCvForApplication(
  userId: string,
  app: Pick<ApplicationWithJob, 'id' | 'job' | 'bestCv' | 'bestCvKey'>,
  now: Date = new Date(),
): Promise<BestCv | null> {
  const src = await loadFitSource(userId)
  const job = applicationJob(app)
  const key = applicationKey(src.key, job)
  if (app.bestCvKey === key) return toBestCv(app.bestCv)
  const best = bestFor(fitContext(src.profile, src.variants, now), job)
  await bestQ.setForApplication(userId, app.id, best, key)
  return best
}
