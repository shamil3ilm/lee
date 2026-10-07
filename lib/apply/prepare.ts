import * as appsQ from '@/lib/db/queries/applications'
import * as discQ from '@/lib/db/queries/discoveries'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as shortlistQ from '@/lib/db/queries/shortlist'
import type { AIProvider } from '@/lib/ai/types'
import { promoteJobDiscovery } from '@/lib/discovery/service'
import { generateTailoredCV, startingCv } from '@/lib/documents/tailor'
import { generateCoverLetter } from '@/lib/documents/coverLetter'
import { resolveSharedLinks } from '@/lib/profile/shared-links'
import { scoreCv } from '@/lib/cv-score/score'
import { chooseVariantForApplication } from '@/lib/variants/service'
import { logger } from '@/lib/logger'
import { counts, isPrepared, PREPARE_STEPS, type PrepareStep, type PrepProgress } from './progress'

/**
 * The Prepare-application flow. Each step is skippable and stored as it
 * finishes, so the user can leave and resume. Nothing here sends anything:
 * the tailored CV and the cover letter are drafts in Documents, and "Mark
 * applied" (lib/apply/applied.ts) only records what the user did.
 */

export class PrepareError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid' = 'invalid',
  ) {
    super(message)
    this.name = 'PrepareError'
  }
}

export interface StartResult {
  applicationId: string
  /** True when this call created the application (status Saved). */
  created: boolean
}

/**
 * Open the flow for a discovery (creating its application if it has none)
 * or for an existing application. Idempotent: a second call returns the
 * same application and keeps the stored progress.
 */
export async function startPrepare(
  userId: string,
  target: { discoveryId: string } | { applicationId: string },
): Promise<StartResult> {
  if ('applicationId' in target) {
    const app = await appsQ.getById(userId, target.applicationId)
    if (!app) throw new PrepareError('Application not found.', 'not_found')
    await prepsQ.ensure(userId, app.id)
    return { applicationId: app.id, created: false }
  }
  const disc = await discQ.getById(userId, target.discoveryId)
  if (!disc) throw new PrepareError('Posting not found.', 'not_found')
  let applicationId = disc.savedApplicationId
  let created = false
  if (!applicationId) {
    const { application } = await promoteJobDiscovery({ userId, discoveryId: disc.id })
    applicationId = application.id
    created = true
  }
  await prepsQ.ensure(userId, applicationId)
  await shortlistQ.setState(userId, [disc.id], 'preparing')
  return { applicationId, created }
}

async function loadPrep(userId: string, applicationId: string): Promise<prepsQ.Prep> {
  const prep = await prepsQ.get(userId, applicationId)
  if (!prep) throw new PrepareError('Start preparing this application first.', 'not_found')
  return prep
}

/**
 * Store new progress; the first time every step before "Mark applied" is
 * done or skipped, stamp prepared_at and log `application_prepared`.
 */
export async function saveProgress(
  userId: string,
  prep: prepsQ.Prep,
  progress: PrepProgress,
  now: Date = new Date(),
): Promise<PrepProgress> {
  const becamePrepared = !prep.preparedAt && isPrepared(progress)
  await prepsQ.save(userId, prep.applicationId, { progress, ...(becamePrepared ? { preparedAt: now } : {}) })
  if (becamePrepared) {
    logger.info('application_prepared', { userId, applicationId: prep.applicationId, ...counts(progress) })
  }
  return progress
}

/** Step 1: use this variant (its current version) — or the master profile when null. */
export async function confirmVariant(userId: string, applicationId: string, variantId: string | null): Promise<PrepProgress> {
  const prep = await loadPrep(userId, applicationId)
  const choice = await chooseVariantForApplication(userId, applicationId, variantId)
  return saveProgress(userId, prep, {
    ...prep.progress,
    variant: { status: 'done', variantId: choice?.variantId ?? null, version: choice?.version ?? null },
  })
}

/** Skip a step (a finished step stays as it is). */
export async function skipStep(userId: string, applicationId: string, step: PrepareStep): Promise<PrepProgress> {
  if (!(PREPARE_STEPS as readonly string[]).includes(step)) throw new PrepareError('Unknown step.')
  const prep = await loadPrep(userId, applicationId)
  if (prep.progress[step]?.status === 'done') return prep.progress
  const skipped = step === 'checklist' ? { status: 'skipped' as const, checked: [] } : { status: 'skipped' as const }
  return saveProgress(userId, prep, { ...prep.progress, [step]: skipped })
}

export interface TailorOutcome {
  progress: PrepProgress
  documentId: string
  scoreBefore: number | null
  scoreAfter: number | null
}

/**
 * Step 2: the tailored CV from the chosen variant (the existing pipeline,
 * fact-locked to the starting CV), then the CV Score of the starting
 * variant vs the tailored CV for this job. The scores are the deterministic
 * ones (no extra AI call). Signal-gating refusals (AISkippedError) bubble up
 * so the caller shows the fix hint and the step stays open.
 */
export async function tailorStep(userId: string, applicationId: string, ai: AIProvider): Promise<TailorOutcome> {
  const prep = await loadPrep(userId, applicationId)
  const doc = await generateTailoredCV({ userId, applicationId, ai })
  const app = await appsQ.getById(userId, applicationId)
  if (!app) throw new PrepareError('Application not found.', 'not_found')
  const start = await startingCv(userId, app)
  const common = { userId, applicationId, application: app, ai: null, includeAi: false }
  const before = start
    ? await scoreCv({
        ...common,
        persist: false,
        source: {
          input: { kind: 'master_cv', cv: start.cv },
          kind: 'master_cv',
          documentId: null,
          label: start.variant ? `${start.variant.name} v${start.variant.version}` : 'Master profile',
        },
      })
    : null
  const after = await scoreCv({ ...common, source: { documentId: doc.id } })
  const scoreBefore = before?.total.score ?? null
  const scoreAfter = after.total.score ?? null
  const progress = await saveProgress(userId, prep, {
    ...prep.progress,
    tailor: { status: 'done', documentId: doc.id, version: doc.version, scoreBefore, scoreAfter },
  })
  return { progress, documentId: doc.id, scoreBefore, scoreAfter }
}

/** Step 3: the cover letter with the profile links the user ticked. */
export async function coverStep(
  userId: string,
  applicationId: string,
  ai: AIProvider,
  linkIds: readonly string[],
): Promise<{ progress: PrepProgress; documentId: string }> {
  const prep = await loadPrep(userId, applicationId)
  const links = await resolveSharedLinks(userId, linkIds)
  const doc = await generateCoverLetter({ userId, applicationId, ai, links })
  const progress = await saveProgress(userId, prep, {
    ...prep.progress,
    cover: { status: 'done', documentId: doc.id, version: doc.version, linkIds: [...linkIds].slice(0, 12) },
  })
  return { progress, documentId: doc.id }
}

/** Step 4: the ticked checklist items; `done` finishes the step. */
export async function saveChecklist(
  userId: string,
  applicationId: string,
  checked: readonly string[],
  done: boolean,
): Promise<PrepProgress> {
  const prep = await loadPrep(userId, applicationId)
  const ids = [...new Set(checked.filter((c) => typeof c === 'string' && c.length <= 40))].slice(0, 40)
  if (!done && prep.progress.checklist === undefined) {
    // Ticks before the step is finished are kept client-side only.
    return prep.progress
  }
  return saveProgress(userId, prep, { ...prep.progress, checklist: { status: 'done', checked: ids } })
}
