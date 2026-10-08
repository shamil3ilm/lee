import type { Criterion } from './types'

/**
 * Evidence shared by every comparison criterion. Each value carries where it
 * came from and how sure lee is:
 *   known      stated by a source (the posting, your current job, a peg)
 *   estimated  computed from your assumptions or inferred by a rule
 *   unknown    nothing to go on: shown as unknown, never counted as zero
 */

export type Confidence = 'known' | 'estimated' | 'unknown'

export type SourceKind =
  | 'posting'
  | 'job_details'
  | 'current_job'
  | 'assumptions'
  | 'peg'
  | 'fx_table'
  | 'reputation'
  | 'your_rating'
  | 'wikidata'
  | 'news'
  | 'master_profile'
  | 'study_list'
  | 'rule'

export const SOURCE_KIND_LABELS: Readonly<Record<SourceKind, string>> = {
  posting: 'Posting',
  job_details: 'Job details',
  current_job: 'Your current job',
  assumptions: 'Your assumptions',
  peg: 'Currency peg',
  fx_table: 'Your FX table',
  reputation: 'Company reputation (confirmed)',
  your_rating: 'Your review notes',
  wikidata: 'Wikidata',
  news: 'News (GDELT)',
  master_profile: 'Your master profile',
  study_list: 'Your study list',
  rule: 'lee rule',
}

export interface SourceRef {
  kind: SourceKind
  /** Short human label ("Posting", "Your FX table, Oct 1, 2026"). */
  label: string
  url?: string | null
  /** Verbatim text from the posting, when the source is the posting. */
  quote?: string | null
}

export interface Evidence {
  /** Stable within one comparison ("pay:1"); AI narratives cite these. */
  id: string
  text: string
  /** Points added to (or taken from) the criterion's base; 0 = context only. */
  effect: number
  confidence: Confidence
  source: SourceRef
  /**
   * What may be sent to an AI model instead of `text`, for lines that name
   * the current job's own values ("vs your 21 days"). Omitted: `text`.
   */
  shared?: string
}

export interface CriterionResult {
  criterion: Criterion
  /** 0–100, or null when unknown (excluded from totals, never zero). */
  score: number | null
  confidence: Confidence
  evidence: Evidence[]
}

export type EvidenceDraft = Omit<Evidence, 'id'>

export const clampScore = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

/** Number evidence lines "<criterion>:<n>" in order. */
export function withIds(criterion: Criterion, drafts: readonly EvidenceDraft[]): Evidence[] {
  return drafts.map((d, i) => ({ ...d, id: `${criterion}:${i + 1}` }))
}

/** A score from a base plus the evidence effects; null when nothing is known. */
export function scored(
  criterion: Criterion,
  base: number,
  drafts: readonly EvidenceDraft[],
  confidence: Confidence,
): CriterionResult {
  const known = drafts.some((d) => d.confidence !== 'unknown')
  const total = base + drafts.reduce((s, d) => s + d.effect, 0)
  return {
    criterion,
    score: known ? clampScore(total) : null,
    confidence: known ? confidence : 'unknown',
    evidence: withIds(criterion, drafts),
  }
}

export function unknownCriterion(criterion: Criterion, drafts: readonly EvidenceDraft[] = []): CriterionResult {
  return { criterion, score: null, confidence: 'unknown', evidence: withIds(criterion, drafts) }
}

/** 1–5 self-ratings → 0–100 (1 → 0, 3 → 50, 5 → 100); null when none. */
export function ratingScore(values: ReadonlyArray<number | null>): number | null {
  const set = values.filter((v): v is number => typeof v === 'number')
  if (set.length === 0) return null
  const avg = set.reduce((s, v) => s + v, 0) / set.length
  return clampScore(((avg - 1) / 4) * 100)
}

/** The sentence around a match in the original text (verbatim, ≤ 180 chars). */
export function quoteAround(source: string, index: number, length: number): string {
  const stops = /[.\n•;!?]/
  let start = index
  while (start > 0 && !stops.test(source[start - 1] ?? '')) start--
  let end = index + length
  while (end < source.length && !stops.test(source[end] ?? '')) end++
  const sentence = source.slice(start, end).replace(/\s+/g, ' ').trim()
  if (sentence.length <= 180) return sentence
  const rel = Math.max(0, index - start - 60)
  return sentence.slice(rel, rel + 180).trim()
}
