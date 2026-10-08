import { loadAcademyContent } from '@/lib/academy/content/catalog'
import type { SkillGraph } from '@/lib/academy/content/graph'
import { writeSkipLog } from '@/lib/ai/log'
import { CV_BULLET_REWRITE_PROMPT_VERSION } from '@/lib/ai/prompts/cv-bullet-rewrite'
import { AISkippedError } from '@/lib/ai/signal'
import type { AIProvider } from '@/lib/ai/types'
import * as appsQ from '@/lib/db/queries/applications'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import * as profileQ from '@/lib/db/queries/profile'
import * as tailoringsQ from '@/lib/db/queries/cvTailorings'
import { resumeYears } from '@/lib/discovery/match/profile'
import type { MatchJob } from '@/lib/discovery/match/types'
import { logger } from '@/lib/logger'
import { getResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { buildRecipe } from '@/lib/variants/presets'
import { loadVariant, VariantError } from '@/lib/variants/service'
import type { Recipe } from '@/lib/variants/types'
import { jobRegions } from '../region'
import { applicationJob } from '../service'
import { checkWordingSignal, lockAiWordings, offeredBullets, wordingRequest, type LockedWordings } from './ai'
import { coverageOf } from './checklist'
import { planTailoring, previewTailoring, type TailorInput, type TailorPlan, type TailorPreview } from './plan'
import type { ChecklistItem, Gap, Suggestion, TailorOutcome } from './types'
import type { Coverage } from '../types'

/**
 * Server side of "Tailor to this JD". Loading, previewing and AI wordings
 * never write; only Save (./save.ts) does. Client input is never trusted:
 * accepted suggestions are ids into a plan recomputed here, and AI wordings
 * are re-locked here before they can be previewed or saved.
 */

export class TailorError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid' = 'invalid',
  ) {
    super(message)
    this.name = 'TailorError'
  }
}

export interface TailorBase {
  variantId: string | null
  version: number | null
  name: string
}

export interface TailorContext {
  app: ApplicationWithJob
  base: TailorBase
  job: MatchJob
  input: TailorInput
}

let graphCache: SkillGraph | null | undefined

function playgroundGraph(): SkillGraph | null {
  if (graphCache !== undefined) return graphCache
  try {
    graphCache = loadAcademyContent().graph
  } catch (err) {
    logger.warn('tailor_playground_graph_failed', { err: err instanceof Error ? err.message : String(err) })
    graphCache = null
  }
  return graphCache
}

async function baseRecipe(userId: string, app: ApplicationWithJob, profile: ResumeProfile, job: MatchJob): Promise<{ recipe: Recipe; base: TailorBase }> {
  if (app.resumeVariantId && app.resumeVariantVersion) {
    try {
      const v = await loadVariant(userId, app.resumeVariantId, app.resumeVariantVersion)
      return { recipe: v.recipe, base: { variantId: v.variant.id, version: v.version, name: v.variant.name } }
    } catch (err) {
      if (!(err instanceof VariantError)) throw err
      logger.warn('tailor_variant_missing', { err: err.message })
    }
  }
  const region = jobRegions(job)[0] ?? 'remote'
  return { recipe: buildRecipe(profile, { region, roleFamily: null, lengthTarget: 2 }), base: { variantId: null, version: null, name: 'Master profile' } }
}

export async function loadTailorContext(
  userId: string,
  applicationId: string,
  opts: { aiWordings?: readonly Suggestion[]; now?: Date } = {},
): Promise<TailorContext> {
  const [app, { profile }, row] = await Promise.all([appsQ.getById(userId, applicationId), getResumeProfile(userId), profileQ.get(userId)])
  if (!app) throw new TailorError('Application not found.', 'not_found')
  const job = applicationJob(app)
  const { recipe, base } = await baseRecipe(userId, app, profile, job)
  const years = row?.yearsExperience ?? resumeYears(profile, opts.now ?? new Date())
  return { app, base, job, input: { profile, recipe, job, years, graph: playgroundGraph(), aiWordings: opts.aiWordings } }
}

/** What the tailoring panel renders (serializable). */
export interface TailorView {
  applicationId: string
  base: TailorBase
  checklist: ChecklistItem[]
  suggestions: Suggestion[]
  gaps: Gap[]
  target: 1 | 2
  coverage: Coverage
  /** The latest saved tailored copy, if any. */
  saved: { documentId: string; createdAt: string; accepted: number } | null
}

export function viewOf(ctx: TailorContext, plan: TailorPlan, saved: tailoringsQ.CvTailoringRow | null): TailorView {
  return {
    applicationId: ctx.app.id,
    base: ctx.base,
    checklist: plan.checklist,
    suggestions: plan.suggestions,
    gaps: plan.gaps,
    target: plan.target,
    coverage: coverageOf(plan.checklist, 'inCv'),
    saved: saved
      ? { documentId: saved.documentId, createdAt: saved.createdAt.toISOString(), accepted: Array.isArray(saved.accepted) ? saved.accepted.length : 0 }
      : null,
  }
}

export async function loadTailorView(userId: string, applicationId: string): Promise<TailorView> {
  const ctx = await loadTailorContext(userId, applicationId)
  const saved = await tailoringsQ.latestForApplication(userId, applicationId)
  return viewOf(ctx, planTailoring(ctx.input), saved)
}

/** An AI wording the client holds: re-locked before use. */
export interface ClientWording {
  highlightId: string
  text: string
}

/** Re-lock wordings sent back by the client (they came from the AI, then crossed the network). */
export function relockClientWordings(ctx: TailorContext, wordings: readonly ClientWording[]): LockedWordings {
  const plan = planTailoring({ ...ctx.input, aiWordings: [] })
  const bullets = offeredBullets(ctx.input.profile, ctx.input.recipe, plan.checklist)
  return lockAiWordings(ctx.input.profile, bullets, { rewrites: wordings.slice(0, 20).map((w) => ({ id: w.highlightId, text: String(w.text).slice(0, 2000) })) }, plan.jd)
}

export async function previewTailor(
  userId: string,
  applicationId: string,
  acceptedIds: readonly string[],
  wordings: readonly ClientWording[] = [],
  now: Date = new Date(),
): Promise<TailorOutcome & { checklist: ChecklistItem[] }> {
  const ctx = await loadTailorContext(userId, applicationId, { now })
  const ai = wordings.length > 0 ? relockClientWordings(ctx, wordings).suggestions : []
  const input = { ...ctx.input, aiWordings: ai }
  const p: TailorPreview = previewTailoring(input, planTailoring(input), acceptedIds, { now })
  return {
    before: p.before,
    after: p.after,
    scoreBefore: p.scoreBefore,
    scoreAfter: p.scoreAfter,
    pagesBefore: p.pagesBefore,
    pagesAfter: p.pagesAfter,
    diff: p.diff,
    checklist: p.checklist,
  }
}

/** Optional AI: new wordings in the JD's terms, locked in code. Signal-gated. */
export async function proposeAiWordings(userId: string, applicationId: string, ai: AIProvider): Promise<LockedWordings> {
  const ctx = await loadTailorContext(userId, applicationId)
  const plan = planTailoring(ctx.input)
  const bullets = offeredBullets(ctx.input.profile, ctx.input.recipe, plan.checklist)
  const signal = checkWordingSignal(bullets, plan.jd)
  if (!signal.ok) {
    await writeSkipLog({ userId, provider: 'unknown', kind: 'cv_bullet_rewrite' }, signal.code)
    throw new AISkippedError(signal.code, signal.message, signal.fixHint)
  }
  const answer = await ai.rewriteCvBullets(wordingRequest(ctx.input.profile, bullets, plan.jd), {
    userId,
    kind: 'cv_bullet_rewrite',
    promptVersion: CV_BULLET_REWRITE_PROMPT_VERSION,
    signalCheckPassed: true,
  })
  return lockAiWordings(ctx.input.profile, bullets, answer, plan.jd)
}
