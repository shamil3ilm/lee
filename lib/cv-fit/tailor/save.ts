import * as documentsQ from '@/lib/db/queries/documents'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as tailoringsQ from '@/lib/db/queries/cvTailorings'
import { saveProgress } from '@/lib/apply/prepare'
import { tailoredCvSchema } from '@/lib/documents/types'
import { snapshotForTailoredCV } from '@/lib/staleness/snapshot'
import { saveResumeProfile } from '@/lib/resume/service'
import { variantToMasterCv } from '@/lib/variants/export'
import { logger } from '@/lib/logger'
import { jdHash } from '../key'
import { addStudySkill } from '../study'
import { planTailoring, previewTailoring } from './plan'
import { loadTailorContext, relockClientWordings, TailorError, type ClientWording, type TailorContext } from './service'
import type { AcceptedSuggestion, GapAction, GapDecision, Suggestion, TailorOutcome } from './types'

/**
 * Save a tailored copy: the accepted suggestions applied to the starting
 * variant, written as a `tailored_cv` document linked to the application
 * with a `cv_tailorings` row (JD hash, base variant and version, every
 * accepted suggestion, the gap decisions and the checklist the cover letter
 * reads). Accepted AI wordings join the master profile first, through the
 * same validation and fact lock as any profile save.
 */

const GAP_ACTIONS: readonly GapAction[] = ['study', 'cover', 'ignore']

function acceptedRecord(s: Suggestion): AcceptedSuggestion {
  const base = { id: s.id, kind: s.kind, requirementIds: s.requirementIds.slice(0, 20) }
  switch (s.kind) {
    case 'swap_wording':
    case 'ai_wording':
      return { ...base, text: s.text, ref: { kind: 'highlight', id: s.highlightId } }
    case 'headline':
    case 'summary':
      return { ...base, text: s.text }
    case 'include':
    case 'lead_bullet':
      return { ...base, ref: s.ref }
    case 'lead_skills':
      return { ...base, text: s.names.join(', ') }
    case 'trim':
      return { ...base, text: `${s.drops.length} lines` }
  }
}

/** A gap decision as stored: the requirement text, and the adjacent evidence for "cover". */
export interface StoredGapDecision extends GapDecision {
  text: string
  evidence?: string
}

function cleanGaps(decisions: readonly GapDecision[], gaps: ReturnType<typeof planTailoring>['gaps']): StoredGapDecision[] {
  const byId = new Map(gaps.map((g) => [g.requirementId, g] as const))
  const out = new Map<string, StoredGapDecision>()
  for (const d of decisions.slice(0, 40)) {
    const gap = byId.get(d.requirementId)
    if (!gap || !GAP_ACTIONS.includes(d.action)) continue
    // "Mention in the cover letter" only with real adjacent evidence.
    if (d.action === 'cover' && !gap.adjacent) continue
    out.set(d.requirementId, {
      requirementId: d.requirementId,
      action: d.action,
      text: gap.text,
      ...(d.action === 'cover' && gap.adjacent ? { evidence: gap.adjacent.text } : {}),
    })
  }
  return [...out.values()]
}

export interface SaveInput {
  accepted: readonly string[]
  wordings?: readonly ClientWording[]
  gaps?: readonly GapDecision[]
}

export interface SaveOutcome extends TailorOutcome {
  documentId: string
  version: number
}

async function writeDocument(userId: string, ctx: TailorContext, cv: unknown): Promise<{ id: string; version: number }> {
  const app = ctx.app
  const version = await documentsQ.nextVersion(userId, app.id, 'tailored_cv')
  const title = `CV — ${app.job.title} @ ${app.job.company?.name ?? 'unknown'} (tailored)`.slice(0, 200)
  const parsed = tailoredCvSchema.parse(cv)
  const stateSnapshot = snapshotForTailoredCV(
    {
      id: app.id,
      status: app.status,
      appliedAt: app.appliedAt,
      jobId: app.jobId,
      updatedAt: app.updatedAt,
      companyId: app.job.companyId ?? null,
      companyName: app.job.company?.name ?? null,
      jobTitle: app.job.title,
    },
    {
      id: app.job.id,
      title: app.job.title,
      descriptionMd: app.job.descriptionMd,
      parsedMeta: app.job.parsedMeta,
      benefits: app.job.benefits,
      updatedAt: app.job.updatedAt,
    },
    parsed,
  )
  const doc = await documentsQ.create(userId, {
    applicationId: app.id,
    kind: 'tailored_cv',
    version,
    title,
    content: { ...parsed, stateSnapshot },
    aiGenerationMeta: ctx.base.variantId ? { resumeVariantId: ctx.base.variantId, resumeVariantVersion: ctx.base.version, tailoredBy: 'lee' } : { tailoredBy: 'lee' },
  })
  return { id: doc.id, version: doc.version }
}

export async function saveTailoredCopy(userId: string, applicationId: string, input: SaveInput, now: Date = new Date()): Promise<SaveOutcome> {
  const first = await loadTailorContext(userId, applicationId, { now })
  const ai = (input.wordings ?? []).length > 0 ? relockClientWordings(first, input.wordings ?? []).suggestions : []
  const ctx = { ...first, input: { ...first.input, aiWordings: ai } }
  const plan = planTailoring(ctx.input)
  const preview = previewTailoring(ctx.input, plan, input.accepted, { now })
  if (preview.wordingIds.size > 0) await saveResumeProfile(userId, preview.profile)
  const master = variantToMasterCv(preview.rendered)
  const leadSkills = preview.accepted.find((s) => s.kind === 'lead_skills')
  const cv = {
    ...master,
    _tailoring: {
      applicationId,
      reasoning: `Tailored by lee from ${ctx.base.name}${ctx.base.version ? ` v${ctx.base.version}` : ''}: ${preview.accepted.length} suggestion${preview.accepted.length === 1 ? '' : 's'} accepted. Facts come from your profile only.`,
      highlighted_skills: leadSkills?.kind === 'lead_skills' ? leadSkills.names.slice(0, 7) : [],
      reordered_experience_indices: [],
      summary_rewrite: preview.accepted.some((s) => s.kind === 'summary'),
    },
  }
  const doc = await writeDocument(userId, ctx, cv)
  const outcome: TailorOutcome = {
    before: preview.before,
    after: preview.after,
    scoreBefore: preview.scoreBefore,
    scoreAfter: preview.scoreAfter,
    pagesBefore: preview.pagesBefore,
    pagesAfter: preview.pagesAfter,
    diff: [],
  }
  await tailoringsQ.create(userId, {
    applicationId,
    documentId: doc.id,
    jdHash: jdHash(ctx.job),
    baseVariantId: ctx.base.variantId,
    baseVersion: ctx.base.version,
    accepted: preview.accepted.map(acceptedRecord),
    gaps: cleanGaps(input.gaps ?? [], plan.gaps),
    requirements: preview.checklist.map((c) => ({ id: c.id, text: c.text, weight: c.weight, status: c.status, evidence: c.evidence ?? null })),
    outcome: { before: outcome.before, after: outcome.after, scoreBefore: outcome.scoreBefore, scoreAfter: outcome.scoreAfter },
  })
  const prep = await prepsQ.get(userId, applicationId)
  if (prep) {
    const score = (n: number | null): number | null => (n === null ? null : Math.max(0, Math.min(100, Math.round(n))))
    await saveProgress(userId, prep, {
      ...prep.progress,
      tailor: { status: 'done', documentId: doc.id, version: doc.version, scoreBefore: score(outcome.scoreBefore), scoreAfter: score(outcome.scoreAfter) },
    })
  }
  logger.info('cv_tailored', { userId, applicationId, accepted: preview.accepted.length, aiWordings: preview.wordingIds.size })
  return { ...outcome, diff: preview.diff, documentId: doc.id, version: doc.version }
}

/** "Add to study list" for one gap: a learning skill in the profile, with where it came from. */
export async function addGapToStudyList(userId: string, applicationId: string, requirementId: string): Promise<{ label: string; created: boolean }> {
  const ctx = await loadTailorContext(userId, applicationId)
  const gap = planTailoring(ctx.input).gaps.find((g) => g.requirementId === requirementId)
  if (!gap) throw new TailorError('That requirement is no longer a gap.')
  const notes = `From ${ctx.app.job.title}${ctx.app.job.company?.name ? ` at ${ctx.app.job.company.name}` : ''}: ${gap.text}`
  const r = addStudySkill(ctx.input.profile, gap.studyLabel, notes)
  if (!r.ok) throw new TailorError(r.error)
  if (r.created) await saveResumeProfile(userId, r.profile)
  return { label: gap.studyLabel, created: r.created }
}
