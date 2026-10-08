import type { SkillGraph } from '@/lib/academy/content/graph'
import type { JobTarget } from '@/lib/cv-score/types'
import { parseJd, type ParsedJd } from '@/lib/discovery/match/jd'
import { skillLabel } from '@/lib/discovery/match/lexicon'
import type { MatchJob } from '@/lib/discovery/match/types'
import { addWordingToProfile } from '@/lib/resume/add-wording'
import type { IdFactory } from '@/lib/resume/ids'
import type { ResumeProfile } from '@/lib/resume/types'
import { variantToMasterCv } from '@/lib/variants/export'
import { renderVariant, type RenderedResume } from '@/lib/variants/render'
import type { Recipe } from '@/lib/variants/types'
import { renderedEvidence } from '../evidence'
import { scoreMasterCv } from '../quality'
import { applySuggestions } from './apply'
import { buildChecklist, coverageOf, recheck } from './checklist'
import { diffResumes } from './diff'
import { gapsFor } from './gaps'
import { suggestForCoverage } from './suggest'
import { headlineAndSummary } from './summary'
import { pageTarget, trimToTarget } from './trim'
import type { ChecklistItem, Gap, Suggestion, TailorOutcome } from './types'
import { profileUnits } from './units'

/**
 * "Tailor to this JD", end to end and pure:
 *   plan     the checklist, every suggestion (deterministic; plus any AI
 *            wordings already locked) and the gaps;
 *   preview  the accepted suggestions applied: the tailored recipe, its
 *            render, coverage and CV Score before/after, the side-by-side
 *            diff. Trim is recomputed on the result of the others.
 */

export interface TailorInput {
  profile: ResumeProfile
  /** The starting recipe (the application's variant version, or a master preset). */
  recipe: Recipe
  job: MatchJob
  years: number | null
  graph: SkillGraph | null
  /** AI wordings that already passed lockAiWordings. */
  aiWordings?: readonly Suggestion[]
}

export interface TailorPlan {
  jd: ParsedJd
  checklist: ChecklistItem[]
  suggestions: Suggestion[]
  gaps: Gap[]
  target: 1 | 2
  base: RenderedResume
}

export function planTailoring(input: TailorInput): TailorPlan {
  const jd = parseJd(input.job)
  const units = profileUnits(input.profile)
  const base = renderVariant(input.profile, input.recipe)
  const checklist = buildChecklist(jd, units, renderedEvidence(base), input.recipe)
  const deterministic = [
    ...suggestForCoverage({ profile: input.profile, recipe: input.recipe, units, checklist, jd }),
    ...headlineAndSummary(input.profile, input.recipe, checklist, units),
  ]
  const suggestions = [...deterministic, ...(input.aiWordings ?? [])]
  const target = pageTarget(input.recipe.region, input.recipe.lengthTarget, input.years)
  const all = applySuggestions(input.profile, input.recipe, deterministic)
  const trim = trimToTarget(input.profile, all, checklist, jd, target)
  if (trim.drops.length > 0) {
    suggestions.push({
      id: 'trim',
      kind: 'trim',
      requirementIds: [],
      drops: trim.drops,
      pages: Math.round(renderVariant(input.profile, all).estimatedPages * 10) / 10,
      target,
      reason: `Drops the ${trim.drops.length} lowest-relevance line${trim.drops.length === 1 ? '' : 's'} to fit ${target} page${target === 1 ? '' : 's'}`,
    })
  }
  return { jd, checklist, suggestions, gaps: gapsFor(checklist, units, input.graph), target, base }
}

export function jobTargetOf(job: MatchJob, jd: ParsedJd): JobTarget {
  return {
    title: job.title,
    techStack: jd.stack.map(skillLabel),
    requirements: jd.must.map((l) => l.text),
    niceToHave: jd.nice.map((l) => l.text),
    responsibilities: jd.responsibilities.map((l) => l.text),
    descriptionMd: job.descriptionMd ?? '',
    location: job.location ?? null,
    remoteType: job.remoteType ?? null,
  }
}

export interface TailorPreview extends TailorOutcome {
  /** The profile with the accepted AI wordings added as approved alternates (saved only on Save). */
  profile: ResumeProfile
  wordingIds: Map<string, string>
  recipe: Recipe
  rendered: RenderedResume
  checklist: ChecklistItem[]
  accepted: Suggestion[]
}

/**
 * Accepted AI wordings join their master highlight as approved alternates
 * (source "ai"), re-checked by the same number lock as any wording. In a
 * preview this profile lives in memory; Save stores it.
 */
export function withAiWordings(
  profile: ResumeProfile,
  accepted: readonly Suggestion[],
  makeId?: IdFactory,
): { profile: ResumeProfile; wordingIds: Map<string, string> } {
  const wordingIds = new Map<string, string>()
  let current = profile
  for (const s of accepted) {
    if (s.kind !== 'ai_wording') continue
    const r = addWordingToProfile(current, s.highlightId, s.text, 'ai', makeId)
    if (!r) continue
    current = r.profile
    wordingIds.set(s.highlightId, r.wordingId)
  }
  return { profile: current, wordingIds }
}

function cvScore(r: RenderedResume, recipe: Recipe, now: Date, target: JobTarget): number | null {
  try {
    return scoreMasterCv(variantToMasterCv(r), recipe.region, now, target).total.score
  } catch {
    return null
  }
}

export function previewTailoring(
  input: TailorInput,
  plan: TailorPlan,
  acceptedIds: readonly string[],
  opts: { now: Date; makeId?: IdFactory },
): TailorPreview {
  const wanted = new Set(acceptedIds)
  const accepted = plan.suggestions.filter((s) => wanted.has(s.id))
  const { profile, wordingIds } = withAiWordings(input.profile, accepted, opts.makeId)
  let recipe = applySuggestions(profile, input.recipe, accepted.filter((s) => s.kind !== 'trim'), wordingIds)
  if (accepted.some((s) => s.kind === 'trim')) recipe = trimToTarget(profile, recipe, plan.checklist, plan.jd, plan.target).recipe
  const rendered = renderVariant(profile, recipe)
  const checklist = recheck(plan.jd, plan.checklist, renderedEvidence(rendered))
  const target = jobTargetOf(input.job, plan.jd)
  return {
    profile,
    wordingIds,
    recipe,
    rendered,
    checklist,
    accepted,
    before: coverageOf(plan.checklist, 'inCv'),
    after: coverageOf(checklist, 'inCv'),
    scoreBefore: cvScore(plan.base, input.recipe, opts.now, target),
    scoreAfter: cvScore(rendered, recipe, opts.now, target),
    pagesBefore: plan.base.estimatedPages,
    pagesAfter: rendered.estimatedPages,
    diff: diffResumes(plan.base, rendered),
  }
}
