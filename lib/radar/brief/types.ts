/**
 * Grounded learning briefs (v16 §1.3). Client-safe types and labels.
 */

export const BRIEF_SECTIONS = ['what', 'architecture', 'workflow', 'how_to_use', 'tradeoffs', 'security', 'compared_with'] as const
export type BriefSectionId = (typeof BRIEF_SECTIONS)[number]

export const BRIEF_SECTION_LABELS: Readonly<Record<BriefSectionId, string>> = {
  what: 'What it is',
  architecture: 'Architecture',
  workflow: 'Workflow',
  how_to_use: 'How to use it',
  tradeoffs: 'Trade-offs & limits',
  security: 'Security notes',
  compared_with: 'Compared with',
}

export const SOURCE_KINDS = ['official_post', 'repo_readme', 'model_card', 'paper_abstract'] as const
export type PrimarySourceKind = (typeof SOURCE_KINDS)[number]

export const SOURCE_KIND_LABELS: Readonly<Record<PrimarySourceKind, string>> = {
  official_post: 'Official post',
  repo_readme: 'Repository README',
  model_card: 'Model card',
  paper_abstract: 'Paper abstract',
}

/** A fetched primary source, as stored with a brief (its text is never stored). */
export interface BriefSource {
  /** Citation id: S1, S2, … */
  id: string
  kind: PrimarySourceKind
  /** The page a reader opens. */
  url: string
  title: string
  fetchedAt: string
}

/** One sentence with the verbatim span it rests on. */
export interface CitedSentence {
  text: string
  quote: string
  /** BriefSource id. */
  source: string
}

export type BriefSections = Record<BriefSectionId, CitedSentence[]>

/** One dated fact, computed from source metadata. */
export interface TimelineEvent {
  /** yyyy-mm-dd */
  date: string
  label: string
  url: string | null
}

export interface BriefDraft {
  entryId: string
  sections: BriefSections
  sources: BriefSource[]
  timeline: TimelineEvent[]
  promptVersion: string
  promptHash: string
  /** Sentences the citation check dropped. */
  dropped: number
  /** HMAC over the draft, so the confirmed brief is exactly what was checked. */
  signature: string
}

export interface BriefModuleCard {
  id: string
  front: string
  back: string
}

export interface BriefModule {
  cards: BriefModuleCard[]
  lab: { href: string; label: string } | null
  createdAt: string
}

export function emptySections(): BriefSections {
  return Object.fromEntries(BRIEF_SECTIONS.map((s) => [s, []])) as unknown as BriefSections
}
