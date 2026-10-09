import type { ImportSource } from '@/lib/resume/types'

/**
 * Client-safe, pure. The one review model every importer (public page,
 * LinkedIn export, CV) produces: a flat list of items, each with a status
 * against what lee already has, rendered by `components/import/import-review`
 * and confirmed item by item. Nothing is applied until the user confirms.
 */

export type { ImportSource }

export const REVIEW_SECTIONS = [
  'basics',
  'skills',
  'work',
  'projects',
  'education',
  'certificates',
  'languages',
  'links',
  'evidence',
  'matching',
] as const
export type ReviewSection = (typeof REVIEW_SECTIONS)[number]

export const SECTION_LABELS: Readonly<Record<ReviewSection, string>> = {
  basics: 'Headline and summary',
  skills: 'Skills',
  work: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certificates: 'Certifications',
  languages: 'Languages',
  links: 'Links',
  evidence: 'Evidence from the page',
  matching: 'Matching details',
}

/**
 *   new        not in lee yet
 *   duplicate  already there (pre-unticked; never added twice)
 *   update     the same item with different details: the diff is shown and
 *              ticking it means "take imported" (unticked = keep mine)
 */
export type ItemStatus = 'new' | 'duplicate' | 'update'

export interface FieldDiff {
  field: string
  label: string
  mine: string
  imported: string
}

/** Where an item goes in JSON Resume (the portfolio's profile.json). */
export type JsonResumePath =
  | 'basics.label'
  | 'basics.summary'
  | 'basics.profiles'
  | 'skills'
  | 'work'
  | 'projects'
  | 'education'
  | 'certificates'
  | 'languages'

export interface ImportItem {
  /** Unique within one review ("skills:3", "work:0"). */
  key: string
  section: ReviewSection
  label: string
  detail: string
  status: ItemStatus
  /** Only for `update`. */
  diff: FieldDiff[]
  /** Carries readiness (depth / interviewReady): the user may mark it "Mine". */
  hasReadiness: boolean
  /**
   * A public profile fact. While profile editing in lee is off
   * (canEditPublicFacts, lib/portfolio/lock.ts) public items become portfolio suggestions;
   * lee-only items (evidence, matching details) are saved either way.
   */
  isPublic: boolean
  /** JSON Resume form of the item, for "Suggested additions for your portfolio". */
  json: { path: JsonResumePath; value: unknown } | null
}

/** What the user confirmed: ticked keys and the ticked items marked "Mine". */
export interface ReviewSelection {
  picked: readonly string[]
  mine: readonly string[]
}

export type Readiness = 'learning' | 'mine'
