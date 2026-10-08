import { parseJd } from '@/lib/discovery/match/jd'
import type { MatchJob } from '@/lib/discovery/match/types'
import type { ResumeProfile } from '@/lib/resume/types'
import { renderVariant } from '@/lib/variants/render'
import type { Recipe, Region } from '@/lib/variants/types'
import { renderedEvidence } from './evidence'
import { bestCvKey } from './key'
import { variantQuality } from './quality'
import { jobRegions } from './region'
import { pickBest, rankFits, scoreVariant, type FitVariantInput } from './score'
import type { BestCv, VariantFit } from './types'

/**
 * Everything the per-job scoring needs from the user's side, built ONCE per
 * pass: each variant is rendered against the current master profile, read
 * into evidence and given its CV Score. Scoring a job is then a parse of
 * its JD plus cheap set lookups, so a backfill over hundreds of rows and
 * the Settings › Variants matrix stay fast. Pure.
 */

export interface VariantForFit {
  id: string
  name: string
  region: Region
  version: number
  recipe: Recipe
}

export interface FitContext {
  key: string
  variants: FitVariantInput[]
}

export function fitContext(profile: ResumeProfile, variants: readonly VariantForFit[], now: Date): FitContext {
  return {
    key: bestCvKey(profile, variants),
    variants: variants.map((v) => {
      const rendered = renderVariant(profile, v.recipe)
      return {
        id: v.id,
        version: v.version,
        name: v.name,
        region: v.region,
        evidence: renderedEvidence(rendered),
        quality: variantQuality(rendered, v.region, now),
      }
    }),
  }
}

/** Every variant scored for one job, best first. */
export function fitsFor(ctx: FitContext, job: MatchJob): VariantFit[] {
  if (ctx.variants.length === 0) return []
  const input = { job, jd: parseJd(job), regions: jobRegions(job) }
  return rankFits(ctx.variants.map((v) => scoreVariant(v, input)))
}

export function bestFor(ctx: FitContext, job: MatchJob): BestCv | null {
  return pickBest(fitsFor(ctx, job))
}
