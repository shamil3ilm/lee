/**
 * v12.0 — AI requirement fit (Role Match component).
 *
 * The model returns met/partial/missing + a verbatim evidence quote per JD
 * requirement. We never trust the quote: `verifyRequirementFit` checks each
 * one exists in the CV text (case/whitespace-insensitive). An unverifiable
 * quote downgrades the status one step (met→partial, partial→missing) so a
 * hallucinated quote can never raise the score.
 */
import type { AIProvider, RequirementFitItem } from '@/lib/ai/types'
import { checkCvScoreSignal } from '@/lib/ai/signal'
import { CV_REQUIREMENT_FIT_PROMPT_VERSION } from '@/lib/ai/prompts/cv-requirement-fit'
import { logger } from '@/lib/logger'
import { makeFinding } from './findings'
import { excerpt, looseNormalize } from './text'
import type { CvFinding, DimensionResult, JobTarget, ScorableCv, SkippedDimension } from './types'

export type FitStatus = 'met' | 'partial' | 'missing'

export interface VerifiedRequirement {
  requirement: string
  status: FitStatus
  evidence: string
  suggestion: string
  evidenceVerified: boolean
  /** Original model status when verification downgraded it. */
  downgradedFrom?: FitStatus
}

export interface RequirementFitDetails {
  items: VerifiedRequirement[]
  met: number
  partial: number
  missing: number
  downgraded: number
}

const DOWNGRADE: Record<FitStatus, FitStatus> = { met: 'partial', partial: 'missing', missing: 'missing' }
const VALUE: Record<FitStatus, number> = { met: 1, partial: 0.5, missing: 0 }

function cleanQuote(q: string): string {
  return looseNormalize(q).replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
}

/**
 * True when every fragment of `evidence` (split on "..."/"…") of at least
 * 3 characters appears verbatim in the CV text after loose normalisation.
 */
export function evidenceInCv(evidence: string, cvText: string): boolean {
  const hay = looseNormalize(cvText)
  const fragments = evidence
    .split(/\.{3}|…/)
    .map(cleanQuote)
    .filter((f) => f.length >= 3)
  if (fragments.length === 0) return false
  return fragments.every((f) => hay.includes(f))
}

/** Align model items to the requested requirements (by text, then order). */
function alignItems(requirements: string[], items: RequirementFitItem[]): (RequirementFitItem | undefined)[] {
  const used = new Set<number>()
  const byText = requirements.map((r) => {
    const idx = items.findIndex((it, i) => !used.has(i) && looseNormalize(it.requirement) === looseNormalize(r))
    if (idx !== -1) used.add(idx)
    return idx
  })
  return requirements.map((_, i) => {
    if (byText[i] !== -1) return items[byText[i]!]
    if (items[i] && !used.has(i)) {
      used.add(i)
      return items[i]
    }
    return undefined
  })
}

export function verifyRequirementFit(
  requirements: string[],
  items: RequirementFitItem[],
  cvText: string,
): VerifiedRequirement[] {
  const aligned = alignItems(requirements, items)
  return requirements.map((requirement, i) => {
    const it = aligned[i]
    if (!it) {
      // The model skipped this requirement — conservative: missing.
      return { requirement, status: 'missing', evidence: '', suggestion: '', evidenceVerified: false }
    }
    const status = it.status as FitStatus
    if (status === 'missing') {
      return { requirement, status, evidence: '', suggestion: it.suggestion, evidenceVerified: false }
    }
    if (it.evidence.trim() && evidenceInCv(it.evidence, cvText)) {
      return { requirement, status, evidence: it.evidence.trim(), suggestion: it.suggestion, evidenceVerified: true }
    }
    return {
      requirement,
      status: DOWNGRADE[status],
      evidence: it.evidence.trim(),
      suggestion: it.suggestion,
      evidenceVerified: false,
      downgradedFrom: status,
    }
  })
}

export function requirementFitResult(items: VerifiedRequirement[]): DimensionResult<RequirementFitDetails> {
  const count = (s: FitStatus): number => items.filter((i) => i.status === s).length
  const score = items.length
    ? Math.round((items.reduce((s, i) => s + VALUE[i.status], 0) / items.length) * 100)
    : 0
  const findings: CvFinding[] = []
  items.forEach((it, index) => {
    if (it.status === 'met') return
    const note = it.downgradedFrom ? ' (the AI\'s supporting quote could not be found in your CV)' : ''
    findings.push(
      makeFinding('requirementFit', {
        severity: it.status === 'missing' ? 'major' : 'minor',
        message: `${it.status === 'missing' ? 'Requirement not evidenced' : 'Requirement only partly evidenced'}: "${excerpt(it.requirement, 90)}"${note}`,
        location: { section: 'Job requirements', index, excerpt: excerpt(it.requirement) },
        ...(it.suggestion ? { suggestion: it.suggestion } : {}),
      }),
    )
  })
  return {
    score,
    details: {
      items,
      met: count('met'),
      partial: count('partial'),
      missing: count('missing'),
      downgraded: items.filter((i) => i.downgradedFrom).length,
    },
    findings,
  }
}

export interface RunRequirementFitInput {
  cv: ScorableCv
  target: JobTarget
  ai: AIProvider | null
  userId?: string
  /** When false the dimension is skipped (batch mode default). */
  includeAi: boolean
  /** Called when the signal check refuses (e.g. to write a skip log row). */
  onSignalSkip?: (code: string) => Promise<void>
}

export interface RunRequirementFitOutput {
  outcome: DimensionResult<RequirementFitDetails> | SkippedDimension
  aiCallId: string | null
}

export async function runRequirementFit(input: RunRequirementFitInput): Promise<RunRequirementFitOutput> {
  if (!input.includeAi || !input.ai) {
    return {
      outcome: { skipped: true, code: 'ai_disabled', reason: 'AI requirement check not run (deterministic-only mode).' },
      aiCallId: null,
    }
  }
  const requirements = input.target.requirements
  const signal = checkCvScoreSignal({ cvText: input.cv.plainText, requirements })
  if (!signal.ok) {
    await input.onSignalSkip?.(signal.code)
    return { outcome: { skipped: true, code: signal.code, reason: signal.message }, aiCallId: null }
  }
  let aiCallId: string | null = null
  try {
    const res = await input.ai.assessRequirementFit(
      { cvText: input.cv.plainText, requirements, jobTitle: input.target.title },
      {
        userId: input.userId,
        kind: 'cv_requirement_fit',
        promptVersion: CV_REQUIREMENT_FIT_PROMPT_VERSION,
        signalCheckPassed: true,
        onLogged: (id) => {
          aiCallId = id
        },
      },
    )
    const verified = verifyRequirementFit(requirements, res.items, input.cv.plainText)
    return { outcome: requirementFitResult(verified), aiCallId }
  } catch (err) {
    logger.error('cv_requirement_fit_failed', { err: err instanceof Error ? err.message : String(err) })
    return {
      outcome: { skipped: true, code: 'ai_error', reason: 'The AI requirement check failed — scored without it.' },
      aiCallId,
    }
  }
}
