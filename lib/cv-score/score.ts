/**
 * v12.0 — CV score orchestration.
 *
 *   computeCvScore (compute.ts) — PURE, deterministic.
 *   scoreCv — loads the source / application / profile, runs the AI
 *             requirement-fit dimension (signal-gated), computes and
 *             persists a `cv_scores` row.
 */
import { writeSkipLog } from '@/lib/ai/log'
import type { AIProvider } from '@/lib/ai/types'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import * as profileQ from '@/lib/db/queries/profile'
import { computeCvScore } from './compute'
import { CvScoreError } from './errors'
import { cvToScorable } from './extract'
import { hasJdSignal, jobTargetFromApplication } from './jd'
import { runRequirementFit } from './requirement-fit'
import { loadDocumentSource, type LoadedSource } from './sources'
import { extractUpload } from './upload'
import type { CvScoreResult, DimensionOutcome, JobTarget, ScoreContext } from './types'

export { computeCvScore } from './compute'
export { SCORER_VERSION } from './version'

export type CvSourceSpec =
  | { documentId: string }
  | { upload: { name: string; bytes: Uint8Array } }

export interface ScoreCvInput {
  userId: string
  source: CvSourceSpec | LoadedSource
  applicationId?: string | null
  ai: AIProvider | null
  /** Run the AI requirement-fit dimension (default true). */
  includeAi?: boolean
  /** Persist a cv_scores row (default true). */
  persist?: boolean
  now?: Date
}

export interface CvScoreRecord extends CvScoreResult {
  id: string | null
  createdAt: string | null
}

function isLoaded(s: ScoreCvInput['source']): s is LoadedSource {
  return 'input' in s
}

export async function resolveSource(userId: string, source: ScoreCvInput['source']): Promise<LoadedSource> {
  if (isLoaded(source)) return source
  if ('documentId' in source) return loadDocumentSource(userId, source.documentId)
  const extracted = await extractUpload(source.upload)
  return {
    input: { kind: 'upload', text: extracted.text, fileType: extracted.fileType, pageCount: extracted.pageCount },
    kind: 'upload',
    documentId: null,
    label: source.upload.name.slice(0, 200),
  }
}

export async function loadTarget(
  userId: string,
  applicationId: string | null | undefined,
): Promise<JobTarget | null> {
  if (!applicationId) return null
  const app = await applicationsQ.getById(userId, applicationId)
  if (!app) throw new CvScoreError('application_not_found', 'Application not found.', 404)
  return jobTargetFromApplication(app)
}

export async function scoreContextFor(userId: string, canAutofix: boolean, now?: Date): Promise<ScoreContext> {
  const profile = await profileQ.get(userId)
  return {
    now: now ?? new Date(),
    canAutofix,
    profile: profile
      ? { seniority: profile.seniority, industries: profile.industries, yearsExperience: profile.yearsExperience }
      : undefined,
  }
}

export async function scoreCv(input: ScoreCvInput): Promise<CvScoreRecord> {
  const loaded = await resolveSource(input.userId, input.source)
  const target = await loadTarget(input.userId, input.applicationId)
  const ctx = await scoreContextFor(input.userId, loaded.kind === 'master_cv', input.now)
  const cv = cvToScorable(loaded.input)

  let requirementFit: DimensionOutcome | undefined
  let aiCallId: string | null = null
  if (hasJdSignal(target)) {
    const fit = await runRequirementFit({
      cv,
      target,
      ai: input.ai,
      userId: input.userId,
      includeAi: input.includeAi ?? true,
      onSignalSkip: (code) =>
        writeSkipLog({ userId: input.userId, provider: 'signal', kind: 'cv_requirement_fit' }, code),
    })
    requirementFit = fit.outcome
    aiCallId = fit.aiCallId
  }

  const result = computeCvScore({
    cv,
    target,
    ctx,
    requirementFit,
    aiCallId,
    source: { kind: loaded.kind, documentId: loaded.documentId, label: loaded.label },
  })

  if (input.persist === false) return { ...result, id: null, createdAt: null }

  const row = await cvScoresQ.create(input.userId, {
    documentId: loaded.documentId,
    applicationId: target?.applicationId ?? null,
    sourceKind: loaded.kind,
    sourceLabel: loaded.label,
    overall: result.total.score ?? 0,
    grade: result.total.grade ?? 'F',
    mode: result.mode,
    scores: { total: result.total, ...result.scores },
    dimensions: result.dimensions,
    findings: result.findings,
    meta: { skipped: result.skipped, weights: result.weights, target: result.target, source: result.source },
    scorerVersion: result.scorerVersion,
    aiCallId,
  })
  return { ...result, id: row.id, createdAt: row.createdAt.toISOString() }
}
