import { GCC_CODES } from '@/lib/discovery/relevance/places'
import type { FollowupStep } from './steps'
import { postingPlaces } from '@/lib/discovery/relevance/gate'

/**
 * Follow-up cadence (review 2026-10-09, B.5): two short notes, then stop.
 *
 *   step 1  a polite check-in      5 business days after applying
 *                                  (3 for a GCC posting through an agency:
 *                                   agencies move fast and drop quiet candidates)
 *   step 2  a final, concise note  10 business days after applying
 *
 * Both marks are editable (Settings › Notifications › Shortlist &
 * follow-ups); the second always comes after the first. Business days are
 * Monday to Friday. Pure: no I/O.
 */

export const FOLLOWUP_CADENCE = { first: 5, second: 10, gccAgencyFirst: 3 } as const

export { FOLLOWUP_STEPS, isFollowupStep, stepOfDraft, type FollowupStep } from './steps'

export interface CadenceMarks {
  /** Business days after applying. */
  first: number
  second: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

/** `n` weekdays after `from`, same time of day. */
export function addBusinessDays(from: Date, n: number): Date {
  let d = new Date(from.getTime())
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS)
    if (!isWeekend(d)) left -= 1
  }
  return d
}

/** Weekdays after the day of `from`, up to and including the day of `to`. */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  let n = 0
  for (let t = start + DAY_MS; t <= end; t += DAY_MS) if (!isWeekend(new Date(t))) n += 1
  return n
}

export function cadenceFor(settings: { followupDays: number; followupSecondDays: number }, gccAgency: boolean): CadenceMarks {
  const first = gccAgency ? Math.min(settings.followupDays, FOLLOWUP_CADENCE.gccAgencyFirst) : settings.followupDays
  return { first, second: Math.max(settings.followupSecondDays, first + 1) }
}

/** The step due after `businessDays`; null before the first mark. */
export function stepDue(businessDays: number, marks: CadenceMarks): FollowupStep | null {
  if (businessDays >= marks.second) return 2
  if (businessDays >= marks.first) return 1
  return null
}

const AGENCY_NAME = /\b(?:recruit\w*|manpower|staffing|placements?|consultan(?:cy|ts?)|headhunt\w*|talent\s+(?:acquisition|solutions|partners)|hr\s+(?:services|solutions|consultants?)|employment\s+(?:agency|services)|executive\s+search|search\s+partners)\b/i
const AGENCY_TEXT = /\b(?:our\s+client|on\s+behalf\s+of\s+(?:our|a|the)\s+client|for\s+(?:a|our)\s+(?:leading\s+)?client|recruitment\s+agency|staffing\s+agency)\b/i

export interface AgencyJob {
  title: string
  location?: string | null
  companyName?: string | null
  descriptionMd?: string | null
}

/** A posting in a GCC country placed by a recruitment agency ("our client…", "… Recruitment LLC"). */
export function isGccAgencyPosting(job: AgencyJob): boolean {
  const regions = postingPlaces({ title: job.title, location: job.location ?? '' }).regions
  if (!GCC_CODES.some((c) => regions.has(c))) return false
  return AGENCY_NAME.test(job.companyName ?? '') || AGENCY_TEXT.test((job.descriptionMd ?? '').slice(0, 4_000))
}
