/**
 * v12 integration — pure view helpers for CV score surfaces outside the
 * /cv-score workbench (application "CV fit" card, documents library badges,
 * dashboard). No server imports: safe to use from client components.
 */
import { HEADLINE_LABELS } from './headlines'
import type { ComponentHeadlineKey } from './types'

/** Total Match below this is worth tailoring before applying. */
export const CV_FIT_TARGET = 70

/** `jd` scores are a Total Match; general scores are CV Quality. */
export function overallLabel(mode: string): string {
  return mode === 'jd' ? HEADLINE_LABELS.total : 'CV Quality'
}

/** What a documents-list badge needs about a document's latest score. */
export interface DocScore {
  overall: number
  mode: string
}

/** documentId -> latest score, from the batched latest-per-document query. */
export function toDocScoreMap(
  rows: readonly { documentId: string; overall: number; mode: string }[],
): Record<string, DocScore> {
  return Object.fromEntries(rows.map((r) => [r.documentId, { overall: r.overall, mode: r.mode }]))
}

export interface HeadlineView {
  key: ComponentHeadlineKey
  label: string
  score: number | null
}

export interface CvFitView {
  id: string
  overall: number
  grade: string
  mode: string
  label: string
  sourceLabel: string
  createdAt: string
  headlines: HeadlineView[]
  /** Change in the overall score since the previous run in the same mode. */
  delta: number | null
}

/** Minimal shape of a cv_scores row this module reads. */
export interface ScoreRowLike {
  id: string
  overall: number
  grade: string
  mode: string
  sourceLabel: string
  scores: unknown
  createdAt: Date
}

const JD_HEADLINES: readonly ComponentHeadlineKey[] = ['roleMatch', 'skillsMatch', 'experienceMatch', 'ats']
const GENERAL_HEADLINES: readonly ComponentHeadlineKey[] = ['ats', 'impact', 'readability', 'structure']

function headlineScore(scores: unknown, key: ComponentHeadlineKey): number | null {
  if (typeof scores !== 'object' || scores === null) return null
  const entry = (scores as Record<string, unknown>)[key]
  if (typeof entry !== 'object' || entry === null) return null
  const value = (entry as { score?: unknown }).score
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Build the card view from an application's score history, newest first.
 * Returns null when the application has never been scored.
 */
export function toCvFitView(rows: readonly ScoreRowLike[]): CvFitView | null {
  const [latest, ...older] = rows
  if (!latest) return null
  const previous = older.find((r) => r.mode === latest.mode)
  const keys = latest.mode === 'jd' ? JD_HEADLINES : GENERAL_HEADLINES
  return {
    id: latest.id,
    overall: latest.overall,
    grade: latest.grade,
    mode: latest.mode,
    label: overallLabel(latest.mode),
    sourceLabel: latest.sourceLabel,
    createdAt: latest.createdAt.toISOString(),
    headlines: keys.map((key) => ({ key, label: HEADLINE_LABELS[key], score: headlineScore(latest.scores, key) })),
    delta: previous ? latest.overall - previous.overall : null,
  }
}

export interface ScorableDocLike {
  id: string
  kind: string
  title: string
}

const SCORING_PREFERENCE = ['tailored_cv', 'latex_cv', 'master_cv'] as const

/**
 * Which CV "Score now" should score for an application: its tailored CV,
 * else its LaTeX CV, else the master CV. Inputs are newest-first, so the
 * first match of a kind is the latest version.
 */
export function pickScoringDocument(docs: readonly ScorableDocLike[]): ScorableDocLike | null {
  for (const kind of SCORING_PREFERENCE) {
    const hit = docs.find((d) => d.kind === kind)
    if (hit) return hit
  }
  return null
}
