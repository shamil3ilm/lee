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
