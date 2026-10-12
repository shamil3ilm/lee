import type { VariantEvidence } from '@/lib/cv-fit/evidence'
import type { ParsedJd } from '@/lib/discovery/match/jd'
import type { MatchDetail, MatchJob, MatchProfile } from '@/lib/discovery/match/types'
import type { NoticePeriod } from '@/lib/discovery/relevance/discovery-prefs'
import type { ResumeProfile } from '@/lib/resume/types'

/**
 * Everything a screening path reads. All of it already exists: the parsed
 * JD, the ready MatchProfile, the stored Match detail (read, never
 * rewritten), the best CV's rendered evidence and a few row facts.
 */

export interface ScreenJob extends MatchJob {
  companyName?: string | null
  applyUrl?: string | null
}

/** The CV the user would send: the best variant for this job, rendered. */
export interface ScreenVariant {
  name: string
  evidence: VariantEvidence
}

export interface ScreenReferral {
  count: number
  people: ReadonlyArray<{ name: string }>
}

export interface ScreenInput {
  job: ScreenJob
  profile: MatchProfile
  resume: ResumeProfile | null
  /** discoveryPrefs.noticePeriods (what the user can do). */
  noticePeriods: readonly NoticePeriod[]
  /** The stored Match detail for this row (null: not scored yet). */
  detail: MatchDetail | null
  /** Best CV variant; null when the user has no variants (the profile stands in). */
  variant: ScreenVariant | null
  postedAt: Date | null
  /** When lee first saw the posting (discoveries.created_at). */
  firstSeenAt: Date | null
  /** LinkedIn connections at the company; undefined when not looked up (lists). */
  referral?: ScreenReferral | null
  now: Date
}

/** The input plus the JD parsed once. */
export interface ScreenContext extends ScreenInput {
  jd: ParsedJd
}
