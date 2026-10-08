import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'

/**
 * "Not for me" feedback. Pure: the reasons, the keys a dismissal is stored
 * under, and how stored feedback feeds back into ranking and into
 * suggestions for the relevance preferences (which the user confirms in
 * Settings › Search, never applied automatically).
 *
 * A dismissal feeds the existing relevance signals three ways:
 *   1. the discovery moves to Dismissed and its scoring call gets the
 *      implicit "dismissed" rating (lib/db/queries/aiCallLogs), as before;
 *   2. the reason, keyed by role family / region / company, lowers similar
 *      postings in the next shortlists (feedbackAdjust below);
 *   3. repeated reasons become a suggested preference change.
 */

export const DISMISS_REASONS = ['role', 'field', 'seniority', 'location', 'pay', 'stack', 'company', 'other'] as const
export type DismissReason = (typeof DISMISS_REASONS)[number]

export const DISMISS_REASON_LABELS: Readonly<Record<DismissReason, string>> = {
  role: 'Wrong kind of role',
  // Teaches lee the title is unrelated (lib/discovery/relevance/learned.ts).
  field: 'Not my field',
  seniority: 'Wrong seniority',
  location: 'Location or remote setup',
  pay: 'Pay too low',
  stack: 'Tech stack doesn’t fit',
  company: 'Not this company',
  other: 'Something else',
}

export function isDismissReason(v: unknown): v is DismissReason {
  return typeof v === 'string' && (DISMISS_REASONS as readonly string[]).includes(v)
}

/** What a dismissal is stored under (no posting text). */
export interface FeedbackKeys {
  roleFamily: string | null
  region: string | null
  companyKey: string | null
}

export interface FeedbackRow extends FeedbackKeys {
  reason: DismissReason
}

/** Company domain (without www.), else the trimmed lower-case name. */
export function companyKeyOf(input: { companyDomain?: string | null; companyName?: string | null; applyUrl?: string | null }): string | null {
  const domain = input.companyDomain?.trim().toLowerCase().replace(/^www\./, '')
  if (domain) return domain.slice(0, 120)
  const name = input.companyName?.trim().toLowerCase()
  return name ? name.slice(0, 120) : null
}

/** Points per kind of feedback match (subtracted from the composite). */
export const FEEDBACK_POINTS = { company: 15, role: 8, location: 8 } as const
/** Same-reason dismissals needed before a role or region is lowered. */
export const REPEAT_THRESHOLD = 2
/** Same-reason dismissals before a preference change is suggested. */
export const SUGGEST_THRESHOLD = 3

export interface FeedbackAdjust {
  points: number
  label: string
}

function count(rows: readonly FeedbackRow[], reason: DismissReason, match: (r: FeedbackRow) => boolean): number {
  return rows.filter((r) => r.reason === reason && match(r)).length
}

/**
 * Penalties for a candidate from the user's earlier "Not for me" reasons:
 * the same company once, the same role family or region twice.
 */
export function feedbackAdjust(candidate: FeedbackKeys & { families?: readonly string[]; regions?: readonly string[] }, rows: readonly FeedbackRow[]): FeedbackAdjust[] {
  const out: FeedbackAdjust[] = []
  if (candidate.companyKey && count(rows, 'company', (r) => r.companyKey === candidate.companyKey) > 0) {
    out.push({ points: -FEEDBACK_POINTS.company, label: 'You passed on this company' })
  }
  const families = candidate.families ?? (candidate.roleFamily ? [candidate.roleFamily] : [])
  const family = families.find((f) => count(rows, 'role', (r) => r.roleFamily === f) >= REPEAT_THRESHOLD)
  if (family) out.push({ points: -FEEDBACK_POINTS.role, label: `You passed on ${roleFamilyLabel(family)} roles` })
  const regions = candidate.regions ?? (candidate.region ? [candidate.region] : [])
  const region = regions.find((g) => count(rows, 'location', (r) => r.region === g) >= REPEAT_THRESHOLD)
  if (region) out.push({ points: -FEEDBACK_POINTS.location, label: 'You passed on this location' })
  return out
}

export interface PrefSuggestion {
  id: string
  text: string
  /** Settings section the user confirms the change in. */
  href: string
}

const SEARCH_PREFS_HREF = '/settings/search#search-preferences'

/** Preference changes the user may want, from repeated reasons. Never applied automatically. */
export function prefSuggestions(rows: readonly FeedbackRow[], targetFamilies: readonly string[]): PrefSuggestion[] {
  const out: PrefSuggestion[] = []
  const byFamily = new Map<string, number>()
  for (const r of rows) {
    if (r.reason === 'role' && r.roleFamily) byFamily.set(r.roleFamily, (byFamily.get(r.roleFamily) ?? 0) + 1)
  }
  for (const [family, n] of byFamily) {
    if (n < SUGGEST_THRESHOLD) continue
    const label = roleFamilyLabel(family)
    out.push({
      id: `role:${family}`,
      text: targetFamilies.includes(family)
        ? `You passed on ${n} ${label} roles. Remove ${label} from your target roles?`
        : `You passed on ${n} ${label} roles. Narrow your target roles so they stop appearing?`,
      href: SEARCH_PREFS_HREF,
    })
  }
  const simple: ReadonlyArray<readonly [DismissReason, string]> = [
    ['seniority', 'Review the seniority levels you search for?'],
    ['location', 'Review your locations and remote scope?'],
    ['pay', 'Set or raise a pay floor so low-paying roles rank lower?'],
  ]
  for (const [reason, text] of simple) {
    const n = rows.filter((r) => r.reason === reason).length
    if (n >= SUGGEST_THRESHOLD) out.push({ id: reason, text: `You passed on ${n} roles for this reason. ${text}`, href: SEARCH_PREFS_HREF })
  }
  return out
}
