import type { Coverage } from '../types'

/**
 * "Tailor to this JD": client-safe types. Every suggestion only selects,
 * orders or re-words what the master profile already holds, and each is
 * accepted or rejected on its own. A missing requirement is NEVER a
 * suggestion: it is a gap with options (study, cover letter, ignore).
 */

export type ReqStatus = 'met' | 'partial' | 'missing'

/** Where a piece of evidence lives in the master profile. */
export interface EvidenceRef {
  kind: 'highlight' | 'skill' | 'project'
  id: string
  /** The work item or project that holds a highlight. */
  itemId?: string
  section?: 'work' | 'projects'
}

export interface ChecklistItem {
  id: string
  text: string
  weight: 'must' | 'nice'
  /** Against the profile's READY evidence: what can honestly be shown. */
  status: ReqStatus
  /** Against the starting CV (the variant as it is). */
  inCv: ReqStatus
  /** The profile line that backs it. */
  evidence?: string
  source?: EvidenceRef
  /** Canonical skills the line names. */
  skills: string[]
}

interface Base {
  id: string
  /** The checklist items this serves. */
  requirementIds: string[]
  reason: string
}

export type Suggestion =
  | (Base & { kind: 'lead_bullet'; ref: EvidenceRef & { kind: 'highlight' }; text: string })
  | (Base & { kind: 'lead_skills'; skillIds: string[]; names: string[] })
  | (Base & { kind: 'include'; ref: EvidenceRef; text: string })
  | (Base & { kind: 'swap_wording'; highlightId: string; wordingId: string; from: string; text: string })
  | (Base & { kind: 'ai_wording'; highlightId: string; from: string; text: string })
  | (Base & { kind: 'headline'; from: string; text: string })
  | (Base & { kind: 'summary'; from: string; text: string })
  | (Base & { kind: 'trim'; drops: Array<{ ref: EvidenceRef; text: string }>; pages: number; target: number })

export type SuggestionKind = Suggestion['kind']

export const SUGGESTION_LABELS: Readonly<Record<SuggestionKind, string>> = {
  lead_bullet: 'Lead with the evidence',
  lead_skills: 'Reorder skills',
  include: 'Include a ready item',
  swap_wording: 'Use an approved wording',
  ai_wording: 'New wording (pending)',
  headline: 'Headline',
  summary: 'Summary',
  trim: 'Trim to the page target',
}

/** A missing requirement: never added to the CV. */
export interface Gap {
  requirementId: string
  text: string
  weight: 'must' | 'nice'
  /** What a study-list item would be called ("Kubernetes"). */
  studyLabel: string
  /** Playground skills it maps to (names); empty when none does. */
  playground: string[]
  /** Real adjacent evidence for the cover letter, with its source; null when there is none. */
  adjacent: { text: string; source: EvidenceRef } | null
}

export type GapAction = 'study' | 'cover' | 'ignore'

export interface GapDecision {
  requirementId: string
  action: GapAction
}

/** What a saved tailoring records per accepted suggestion. */
export interface AcceptedSuggestion {
  id: string
  kind: SuggestionKind
  requirementIds: string[]
  /** The new text, for wordings / headline / summary. */
  text?: string
  ref?: EvidenceRef
}

export interface DiffLine {
  text: string
  state: 'same' | 'moved' | 'added' | 'removed'
}

export interface DiffSection {
  label: string
  before: DiffLine[]
  after: DiffLine[]
}

export interface TailorOutcome {
  before: Coverage
  after: Coverage
  scoreBefore: number | null
  scoreAfter: number | null
  pagesBefore: number
  pagesAfter: number
  diff: DiffSection[]
}
