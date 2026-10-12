/**
 * The screening path: "would I get through?" as a chain of hiring stages
 * (docs/superpowers/specs/2026-10-12-hiring-process-matching-design.md):
 *   (a) eligibility knockouts · (b) ATS / keyword search on the CV you send ·
 *   (c) the recruiter's 30-second screen · (d) the hiring manager's depth
 *   check · (e) the odds for this posting (shown only, never in Fit).
 *
 * Phase 1 is explain-only: the path is computed on read from the parsed JD,
 * the ready profile, the stored Match detail and the best CV. It never
 * changes a Fit number. Pure data: safe to import from client components.
 */

export const SCREEN_VERSION = 's1'

export const STAGE_KEYS = ['eligibility', 'ats', 'recruiter', 'manager', 'odds'] as const
export type StageKey = (typeof STAGE_KEYS)[number]

/** Stages that gate a screener's decision (odds are context only). */
export const GATE_STAGES: readonly StageKey[] = ['eligibility', 'ats', 'recruiter', 'manager']

export type StageStatus = 'pass' | 'at_risk' | 'fail' | 'unknown'

export const STAGE_LABELS: Readonly<Record<StageKey, string>> = {
  eligibility: 'Eligibility',
  ats: 'ATS keywords',
  recruiter: 'Recruiter',
  manager: 'Hiring manager',
  odds: 'Odds',
}

export const STATUS_LABELS: Readonly<Record<StageStatus, string>> = {
  pass: 'Pass',
  at_risk: 'At risk',
  fail: 'Fail',
  unknown: 'Unknown',
}

export type ScreenActionKind =
  | 'use_variant'
  | 'add_keyword'
  | 'prepare'
  | 'ask'
  | 'referral'
  | 'apply_direct'
  | 'quantify'
  | 'study'

/** What raises the odds. Honest by construction: built only from the user's own facts. */
export interface ScreenAction {
  kind: ScreenActionKind
  label: string
}

export interface StageCheck {
  /** 'visa', 'nationals', 'notice', 'keyword:postgresql', … */
  key: string
  status: StageStatus
  /** "JD: 'UAE nationals only'" / "You: sponsorship needed in UAE". */
  reason: string
  /** A few words for the card chip: "notice period". */
  short?: string
  action?: ScreenAction
}

export interface StageResult {
  stage: StageKey
  status: StageStatus
  /** 0..1, how strongly it passes (P1 combines these; P0 only shows them). */
  score: number
  /** One line for the path: "6 of 8 must-haves in “GCC · Backend”". */
  summary: string
  /** A few words for the card chip when the stage isn't a pass (else its worst check's `short`). */
  short?: string
  checks: StageCheck[]
}

export interface ScreeningPath {
  v: string
  stages: StageResult[]
  /** "Next" actions, most useful first (at most a handful). */
  next: ScreenAction[]
}
