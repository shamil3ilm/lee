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
  /** Location written next to the company ("Dubai, UAE (Remote)"), text sources. */
  location?: string
  /** v1.1 — indexes into `ScorableCv.lines` of the role's header line(s). */
  lines?: number[]
}

/** v1.1 — one cited source line: its index in `ScorableCv.lines` and its text. */
export interface CvLineRef {
  index: number
  text: string
  /** Substring of `text` the finding is about (for highlighting). */
  highlight?: string
}

/** v1.1 — per-line layout from a positioned source (PDF), aligned to `ScorableCv.lines`. */
export interface LineLayout {
  page: number
  /** Left edge of the first glyph on the line. */
  x: number
  /** Right edge of the last glyph on the line. */
  right: number
  /** Baseline y (PDF units, grows upwards). */
  y: number
  fontSize: number
  /** Vertical distance from the previous line on the same page (0 for a page's first line). */
  gapBefore: number
}

export interface ScorableCv {
  plainText: string
  sections: {
    heading: string
    lines: string[]
    /** v1.1 — index in `ScorableCv.lines` of each entry of `lines`. */
    lineIndexes?: number[]
    /** v1.1 — index of the heading line itself (absent for the implicit Header). */
    headingIndex?: number
  }[]
  bullets: { section: string; roleIndex?: number; text: string; lines?: number[] }[]
  roles: ScorableRole[]
  skillsListed: string[]
  contact: {
    email?: string
    phone?: string
    linkedin?: string
    location?: string
    /** v1.1 — from text or from PDF/DOCX hyperlinks. */
    github?: string
    website?: string
  }
  /**
   * v1.1 — every line of the source as scored (finding evidence indexes into
   * this). Always set by `cvToScorable`; optional for hand-built inputs.
   */
  lines?: string[]
  /** v1.1 — hyperlink targets found in the file (PDF link annotations, DOCX hyperlinks). */
  links?: string[]
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
  /** v1.1 — the exact source line(s) this finding is about. */
  evidence?: CvLineRef[]
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
  /** v1.1 — the job's location / remote type, for region-aware advice. */
  location?: string | null
  remoteType?: string | null
}

/** v1.1 — the hiring market a CV is aimed at (drives phone and length advice). */
export type CvMarket = 'gcc' | 'india' | 'us' | 'uk' | 'europe' | 'other'

export interface RegionHint {
  market: CvMarket
  /** Where the market came from: the target job, or the user's search preferences. */
  source: 'job' | 'prefs'
  /** Human label ("UAE", "US remote", "GCC and India"). */
  label: string
  /** True for a remote role (US remote roles prefer 1 page early in a career). */
  remote?: boolean
}

export interface ScoreContext {
  /** Reference "now" for `present` roles — injected for determinism. */
  now: Date
  /** When true, autoFixable findings are allowed (master CV sources only). */
  canAutofix: boolean
  /** Profile hints used when the CV itself is thin. */
  profile?: { seniority?: string | null; industries?: string[]; yearsExperience?: number | null }
  /**
   * v1.1 — target market from the user's search preferences. A target job's
   * own location (JobTarget.location) takes precedence when known.
   */
  region?: RegionHint | null
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
