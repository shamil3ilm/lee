/**
 * v12.0 — career-timeline helpers (years of experience, gaps).
 */
import { resolveEnd } from './dates'
import { monthsBetween } from './text'
import type { ScorableRole } from './types'

export interface Interval {
  start: string
  end: string
  roleIndex: number
}

export function roleIntervals(roles: ScorableRole[], now: Date): Interval[] {
  const out: Interval[] = []
  roles.forEach((r, roleIndex) => {
    const end = resolveEnd(r.end, now)
    if (!r.start || !end || !/^\d{4}-\d{2}$/.test(r.start) || !/^\d{4}-\d{2}$/.test(end)) return
    if (monthsBetween(r.start, end) < 0) return
    out.push({ start: r.start, end, roleIndex })
  })
  return out
}

/** Total months of experience with overlapping roles merged. */
export function experienceMonths(roles: ScorableRole[], now: Date): number {
  const ivs = roleIntervals(roles, now).sort((a, b) => a.start.localeCompare(b.start))
  let total = 0
  let curStart: string | null = null
  let curEnd: string | null = null
  for (const iv of ivs) {
    if (curStart === null || curEnd === null) {
      curStart = iv.start
      curEnd = iv.end
      continue
    }
    if (iv.start <= curEnd) {
      if (iv.end > curEnd) curEnd = iv.end
    } else {
      total += monthsBetween(curStart, curEnd) + 1
      curStart = iv.start
      curEnd = iv.end
    }
  }
  if (curStart !== null && curEnd !== null) total += monthsBetween(curStart, curEnd) + 1
  return total
}

export function experienceYears(roles: ScorableRole[], now: Date): number {
  return Math.round((experienceMonths(roles, now) / 12) * 10) / 10
}

export interface Gap {
  afterRoleIndex: number
  beforeRoleIndex: number
  months: number
}

/** Employment gaps longer than `minMonths` between consecutive roles. */
export function employmentGaps(roles: ScorableRole[], now: Date, minMonths = 6): Gap[] {
  const ivs = roleIntervals(roles, now).sort((a, b) => a.start.localeCompare(b.start))
  const gaps: Gap[] = []
  let maxEnd: Interval | null = null
  for (const iv of ivs) {
    if (maxEnd) {
      const m = monthsBetween(maxEnd.end, iv.start) - 1
      if (m > minMonths) gaps.push({ afterRoleIndex: maxEnd.roleIndex, beforeRoleIndex: iv.roleIndex, months: m })
    }
    if (!maxEnd || iv.end > maxEnd.end) maxEnd = iv
  }
  return gaps
}

// ---------------------------------------------------------------------------
// v1.1 — role classification, weighted engineering years, chronology
// ---------------------------------------------------------------------------

export type RoleKind = 'engineering' | 'internship' | 'other'

/** Internships count at this weight towards engineering years. */
export const INTERNSHIP_WEIGHT = 0.5

const INTERN_RE = /\b(intern|internship|trainee|apprentice|apprenticeship|co-?op|working student|student assistant)\b/i
const ENGINEERING_RE = /\b(engineer(?:ing)?|developer|programmer|architect|devops|devsecops|sre|swe|sde|software|full[- ]?stack|front[- ]?end|back[- ]?end|web|mobile|ios|android|data (?:scientist|engineer|analyst)|machine learning|ml|ai|qa|tester|test automation|security|cloud|platform|infrastructure|sysadmin|system administrator|systems administrator|it support|it|technical|tech lead|cto|php|laravel|java|python|node(?:\.js)?|react|\.net|database|dba|coder|game|embedded|firmware|blockchain)\b/i

/**
 * Engineering (counts fully), internship (counts at INTERNSHIP_WEIGHT) or
 * other (a non-engineering role — not counted towards engineering years).
 * An untitled role is given the benefit of the doubt.
 */
export function classifyRole(role: Pick<ScorableRole, 'title'>): RoleKind {
  const t = role.title.trim()
  if (!t) return 'engineering'
  if (INTERN_RE.test(t)) return 'internship'
  return ENGINEERING_RE.test(t) ? 'engineering' : 'other'
}

type Span = [start: string, end: string]

function mergeSpans(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0].localeCompare(b[0]))
  const out: Span[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    // Adjacent months (Jan–Mar, Apr–Jun) merge too: there is no gap between them.
    if (last && monthsBetween(last[1], s[0]) <= 1) {
      out[out.length - 1] = [last[0], s[1] > last[1] ? s[1] : last[1]]
    } else out.push([s[0], s[1]])
  }
  return out
}

function spanMonths(spans: readonly Span[]): number {
  return spans.reduce((n, [a, b]) => n + monthsBetween(a, b) + 1, 0)
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Months of `spans` not covered by `cover`. */
function monthsOutside(spans: readonly Span[], cover: readonly Span[]): number {
  let n = 0
  for (const [a, b] of spans) {
    for (let m = a; m <= b; m = nextMonth(m)) {
      if (!cover.some(([c, d]) => m >= c && m <= d)) n++
    }
  }
  return n
}

export interface ExperienceBreakdown {
  /** Weighted engineering years (one decimal) — what page length and seniority use. */
  years: number
  /** Merged months of full-time engineering roles. */
  fullTimeMonths: number
  /** Merged internship months that don't overlap full-time engineering work. */
  internshipMonths: number
  /** Merged months in non-engineering roles (not counted towards `years`). */
  otherMonths: number
  /** All roles merged (the v1.0 "years" figure × 12). */
  totalMonths: number
  internshipWeight: number
  /** True when the CV has no engineering roles at all, so every role was counted. */
  allRolesCounted: boolean
  kinds: RoleKind[]
}

export function experienceBreakdown(roles: ScorableRole[], now: Date): ExperienceBreakdown {
  const kinds = roles.map(classifyRole)
  const ivs = roleIntervals(roles, now)
  const spansOf = (k: RoleKind): Span[] =>
    mergeSpans(ivs.filter((iv) => kinds[iv.roleIndex] === k).map((iv): Span => [iv.start, iv.end]))
  const all = mergeSpans(ivs.map((iv): Span => [iv.start, iv.end]))
  const eng = spansOf('engineering')
  const intern = spansOf('internship')
  const other = spansOf('other')
  const allRolesCounted = eng.length === 0 && intern.length === 0 && other.length > 0
  const fullTimeMonths = allRolesCounted ? spanMonths(other) : spanMonths(eng)
  const internshipMonths = monthsOutside(intern, eng)
  const otherMonths = allRolesCounted ? 0 : spanMonths(other)
  const counted = fullTimeMonths + INTERNSHIP_WEIGHT * internshipMonths
  return {
    years: Math.round((counted / 12) * 10) / 10,
    fullTimeMonths,
    internshipMonths,
    otherMonths,
    totalMonths: spanMonths(all),
    internshipWeight: INTERNSHIP_WEIGHT,
    allRolesCounted,
    kinds,
  }
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`

/** "11 months full-time + 8 months of internships counted at half; 17 months in non-engineering roles not counted". */
export function breakdownSummary(b: ExperienceBreakdown): string {
  const parts = [`${plural(b.fullTimeMonths, 'month')} full-time`]
  if (b.internshipMonths) parts.push(`${plural(b.internshipMonths, 'month')} of internships counted at half`)
  let s = parts.join(' + ')
  if (b.otherMonths) s += `; ${plural(b.otherMonths, 'month')} in non-engineering roles not counted`
  return s
}

/** Sort key: `present` first, then end date, then start date. */
function chronoKey(r: ScorableRole, now: Date): { end: string; start: string } | null {
  const end = r.end === 'present' ? '9999-12' : resolveEnd(r.end, now)
  if (!end || !/^\d{4}-\d{2}$/.test(end) || !r.start || !/^\d{4}-\d{2}$/.test(r.start)) return null
  return { end, start: r.start }
}

/**
 * Indexes `i` where role i+1 is clearly more recent than role i: it ends
 * later (or as late, starting later) AND did not start earlier. Overlapping
 * roles, end-date ordering and start-date ordering are all fine.
 */
export function chronologyInversions(roles: ScorableRole[], now: Date): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < roles.length; i++) {
    const a = chronoKey(roles[i]!, now)
    const b = chronoKey(roles[i + 1]!, now)
    if (!a || !b) continue
    const later = b.end > a.end || (b.end === a.end && b.start > a.start)
    if (later && b.start >= a.start) out.push(i)
  }
  return out
}
