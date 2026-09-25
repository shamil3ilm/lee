/**
 * v12.0 — PURE CV score computation (no DB / env imports, so the eval
 * harness can run it directly). ScorableCv + optional JD target + a
 * precomputed AI outcome → CvScoreResult, deterministic for identical input.
 */
import { scoreAts } from './dimensions/ats'
import { scoreDomain } from './dimensions/domain'
import { scoreImpact } from './dimensions/impact'
import { scoreKeywords } from './dimensions/keywords'
import { scoreReadability } from './dimensions/readability'
import { scoreRoleAlignment } from './dimensions/role-alignment'
import { scoreSeniority } from './dimensions/seniority'
import { scoreStructure } from './dimensions/structure'
import { sortFindings } from './findings'
import { composeHeadlines } from './headlines'
import { hasJdSignal } from './jd'
import { SCORER_VERSION } from './version'
import {
  isSkipped,
  type ComponentHeadlineKey,
  type CvScoreResult,
  type DimensionKey,
  type DimensionOutcome,
  type JobTarget,
  type ScorableCv,
  type ScoreContext,
} from './types'

export interface ComputeInput {
  cv: ScorableCv
  target: JobTarget | null
  ctx: ScoreContext
  /** Precomputed AI requirement-fit outcome; omitted → skipped. */
  requirementFit?: DimensionOutcome
  aiCallId?: string | null
  source: CvScoreResult['source']
}

export function computeCvScore(input: ComputeInput): CvScoreResult {
  const { cv, ctx } = input
  const target = hasJdSignal(input.target) ? input.target : null
  const jdMode = target !== null

  const dimensions: Partial<Record<DimensionKey, DimensionOutcome>> = {}
  if (target) {
    dimensions.requirementFit = input.requirementFit ?? {
      skipped: true,
      code: 'ai_disabled',
      reason: 'AI requirement check not run.',
    }
    dimensions.roleAlignment = scoreRoleAlignment(cv, target)
    dimensions.keywords = scoreKeywords(cv, target, ctx)
    dimensions.seniority = scoreSeniority(cv, target, ctx)
    dimensions.domain = scoreDomain(cv, target, ctx)
  }
  dimensions.ats = scoreAts(cv)
  dimensions.impact = scoreImpact(cv, ctx)
  dimensions.readability = scoreReadability(cv)
  dimensions.structure = scoreStructure(cv, ctx)

  const composed = composeHeadlines({ dimensions, jdMode, targetTitle: target?.title })
  const weightOf = (k: ComponentHeadlineKey): number => composed.scores[k].weight
  const allFindings = Object.values(dimensions).flatMap((d) => (d && !isSkipped(d) ? d.findings : []))
  const seen = new Set<string>()
  const unique = allFindings.filter((f) => {
    if (seen.has(f.id)) return false
    seen.add(f.id)
    return true
  })

  return {
    scorerVersion: SCORER_VERSION,
    mode: jdMode ? 'jd' : 'general',
    total: composed.total,
    scores: composed.scores,
    weights: composed.weights,
    dimensions,
    findings: sortFindings(unique, weightOf),
    skipped: composed.skipped,
    aiCallId: input.aiCallId ?? null,
    source: input.source,
    target:
      target && target.applicationId
        ? {
            applicationId: target.applicationId,
            title: target.title,
            ...(target.companyName ? { companyName: target.companyName } : {}),
          }
        : null,
  }
}
