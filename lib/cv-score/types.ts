/**
 * v12.0 — CV Scoring shared types.
 *
 * The scorer is layered:
 *   1. `extract.ts` turns any CV source (structured JSON, LaTeX, uploaded
 *      file text) into a `ScorableCv`.
 *   2. `dimensions/*.ts` are pure, deterministic analyses over a ScorableCv
 *      (+ optional JD target). Each returns a `DimensionResult`.
 *   3. `requirement-fit.ts` is the only AI-backed dimension (signal-gated,
 *      evidence-verified).
 *   4. `headlines.ts` combines dimensions into the user-facing HEADLINE
 *      scores (Total Match, Role/Skills/Experience Match, ATS, Impact,
 *      Readability, Structure).
 */

import type { AiUsage } from '@/lib/ai/usage-types'

export type CvSourceKind = 'master_cv' | 'tailored_cv' | 'latex_cv' | 'upload'

export interface ScorableRole {
  company: string
  title: string
  /** Normalised `YYYY-MM` when parseable. */
  start?: string
  /** Normalised `YYYY-MM`, or the literal `present`. */
  end?: string
  bullets: string[]
  /** Tech used in the role (structured sources only). */
  tech?: string[]
}

export interface ScorableCv {
  plainText: string
  sections: { heading: string; lines: string[] }[]
  bullets: { section: string; roleIndex?: number; text: string }[]
  roles: ScorableRole[]
  skillsListed: string[]
  contact: { email?: string; phone?: string; linkedin?: string; location?: string }
  /** Headline / summary line when known (structured sources). */
  headline?: string
  meta: {
    sourceKind: CvSourceKind
    pageCountEstimate?: number
    columnsSuspected?: boolean
    fileType?: string
    /** True when the CV came from structured JSON (no parse ambiguity). */
    structured?: boolean
    /** Canonical section keys in document order (experience, education…). */
    sectionOrder?: string[]
  }
}

export type Severity = 'critical' | 'major' | 'minor'

export type DimensionKey =
  | 'keywords'
  | 'requirementFit'
  | 'roleAlignment'
  | 'impact'
  | 'ats'
  | 'structure'
  | 'readability'
  | 'seniority'
  | 'domain'

export type HeadlineKey =
  | 'total'
  | 'roleMatch'
  | 'skillsMatch'
  | 'experienceMatch'
  | 'ats'
  | 'impact'
  | 'readability'
  | 'structure'

/** Headline scores that contribute to Total Match (i.e. everything but total). */
export type ComponentHeadlineKey = Exclude<HeadlineKey, 'total'>

/** Machine-readable fix payload for `autoFixable` findings. */
export type FindingFix =
  | { kind: 'rewrite_bullet'; roleIndex: number; bulletIndex: number }
  | { kind: 'add_skill'; term: string }

export interface CvFinding {
  /** Stable id (deterministic for identical inputs) — used by autofix. */
  id: string
  dimension: DimensionKey
  /** Headline scores this finding affects — lets the UI filter per score. */
  headlines: ComponentHeadlineKey[]
  severity: Severity
  message: string
  location?: { section: string; index?: number; excerpt: string }
  suggestion?: string
  autoFixable: boolean
  fix?: FindingFix
}

export interface DimensionResult<D = object> {
  score: number
  details: D
  findings: CvFinding[]
}

export interface SkippedDimension {
  skipped: true
  code: string
  reason: string
}

export type DimensionOutcome = DimensionResult | SkippedDimension

export function isSkipped(d: DimensionOutcome | undefined): d is SkippedDimension {
  return !!d && 'skipped' in d && d.skipped === true
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface BreakdownItem {
  key: string
  label: string
  score: number | null
  /** Relative weight within the headline (0..1, renormalised). */
  weight: number
  note?: string
}

export interface HeadlineScore {
  key: HeadlineKey
  label: string
  score: number | null
  grade: Grade | null
  /** Effective weight in Total Match (0..1, renormalised). 0 for total itself. */
  weight: number
  /** Base weight before renormalisation (percent, as in the spec table). */
  baseWeight: number
  skipped?: boolean
  /** Human reason when skipped (or partially computed). */
  reason?: string
  verdict: string
  breakdown: BreakdownItem[]
}

export interface SkippedEntry {
  key: HeadlineKey | DimensionKey
  code: string
  reason: string
}

/** The job a CV is scored against, distilled from an application. */
export interface JobTarget {
  applicationId?: string
  title: string
  companyName?: string
  seniority?: string
  techStack: string[]
  requirements: string[]
  niceToHave: string[]
  responsibilities: string[]
  descriptionMd: string
}

export interface ScoreContext {
  /** Reference "now" for `present` roles — injected for determinism. */
  now: Date
  /** When true, autoFixable findings are allowed (master CV sources only). */
  canAutofix: boolean
  /** Profile hints used when the CV itself is thin. */
  profile?: { seniority?: string | null; industries?: string[]; yearsExperience?: number | null }
}

export interface CvScoreResult {
  scorerVersion: string
  mode: 'jd' | 'general'
  total: HeadlineScore
  scores: Record<ComponentHeadlineKey, HeadlineScore>
  /** How Total Match is computed — base + effective weight per score. */
  weights: { key: ComponentHeadlineKey; label: string; base: number; effective: number }[]
  dimensions: Partial<Record<DimensionKey, DimensionOutcome>>
  findings: CvFinding[]
  skipped: SkippedEntry[]
  aiCallId: string | null
  /** v18 — AI usage of the response that produced this result; absent on stored results. */
  usage?: AiUsage | null
  source: { kind: CvSourceKind; documentId?: string | null; label: string }
  target: { applicationId: string; title: string; companyName?: string } | null
}
