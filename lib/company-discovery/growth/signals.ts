import type { GrowthSignal } from './types'

/**
 * The growth signals, each a pure function of facts lee stored (see
 * ./inputs.ts). Sub-scores are 0–100 with 50 = flat; trends are measured
 * against the company's OWN baseline, so a 3 → 8 role company outranks a
 * 300 → 310 one, and how famous a company is never moves a score.
 */

const DAY = 86_400_000

export interface RoleSnapshot {
  /** yyyy-mm-dd of the count. */
  d: string
  n: number
}

export interface NewsEvent {
  /** funding | expansion | acquisition | layoffs | closure */
  c: string
  d: string
  u: string
  t: string
}

export interface GithubActivity {
  /** yyyy-mm-dd it was measured. */
  at: string
  /** Commits in the last 13 weeks and the 13 before (the most active public repos). */
  c90: number
  cp90: number
  /** Public repos created in the last 90 days and the 90 before. */
  nr90: number
  nrp90: number
  /** Stars across the org's recent repos (visibility only; never scored). */
  stars: number
}

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n))
const round = (n: number): number => Math.round(clamp(n))
const daysBetween = (a: Date, b: Date): number => (a.getTime() - b.getTime()) / DAY
const day = (d: Date): string => d.toISOString().slice(0, 10)

/** Relative change against the company's own baseline, floored so tiny bases do not explode. */
export function relChange(now: number, past: number, floor: number): number {
  return (now - past) / Math.max(past, floor)
}

/** A trend → sub-score: 50 flat, toward 100 for growth, toward 0 for shrinking. */
export function trendScore(g: number, gain = 1.2): number {
  return round(50 + 50 * Math.tanh(gain * g))
}

function nearest(snaps: readonly RoleSnapshot[], target: Date, within: number): RoleSnapshot | null {
  let best: RoleSnapshot | null = null
  let bestGap = Infinity
  for (const s of snaps) {
    const gap = Math.abs(daysBetween(new Date(`${s.d}T00:00:00Z`), target))
    if (gap <= within && gap < bestGap) {
      best = s
      bestGap = gap
    }
  }
  return best
}

/**
 * Hiring velocity. Preferred: the weekly open-role counts of the company's
 * job board (now vs about 30 and 90 days ago). Fallback while that history
 * builds: postings lee first saw from the employer in the last 30 days vs
 * the 60 before (per 30 days).
 */
export function hiringSignal(
  input: { snapshots: readonly RoleSnapshot[]; boardLabel?: string | null; jobsRecent30?: number; jobsPrior60?: number },
  now: Date,
): GrowthSignal {
  const unknown: GrowthSignal = { kind: 'hiring', score: null, detail: 'No open-role history yet (counts build weekly)', source: 'Job board counts', date: null, confidence: 'low' }
  const snaps = [...input.snapshots].sort((a, b) => a.d.localeCompare(b.d))
  const latest = snaps[snaps.length - 1]
  const source = input.boardLabel ? `${input.boardLabel} job board, weekly counts` : 'Job board, weekly counts'
  if (latest && daysBetween(now, new Date(`${latest.d}T00:00:00Z`)) <= 14) {
    const latestAt = new Date(`${latest.d}T00:00:00Z`)
    const p30 = nearest(snaps.slice(0, -1), new Date(latestAt.getTime() - 30 * DAY), 10)
    const p90 = nearest(snaps.slice(0, -1), new Date(latestAt.getTime() - 90 * DAY), 21)
    if (p30 || p90) {
      const g30 = p30 ? relChange(latest.n, p30.n, 2) : null
      const g90 = p90 ? relChange(latest.n, p90.n, 2) : null
      const g = g30 !== null && g90 !== null ? 0.4 * g30 + 0.6 * g90 : (g90 ?? g30)!
      const parts = [p30 ? `${p30.n} about 30 days ago` : null, p90 ? `${p90.n} about 90 days ago` : null].filter(Boolean).join(', ')
      return {
        kind: 'hiring',
        score: trendScore(g),
        detail: `${latest.n} open role${latest.n === 1 ? '' : 's'} now; ${parts}`,
        source,
        date: latest.d,
        confidence: p30 && p90 ? 'high' : 'medium',
      }
    }
  }
  const recent = input.jobsRecent30 ?? 0
  const prior = input.jobsPrior60 ?? 0
  if (recent + prior >= 2) {
    const g = relChange(recent, prior / 2, 1)
    return {
      kind: 'hiring',
      score: trendScore(g, 0.8),
      detail: `${recent} new posting${recent === 1 ? '' : 's'} seen in the last 30 days; ${prior} in the 60 before`,
      source: 'Postings lee collected (ATS boards, alerts, imports)',
      date: day(now),
      confidence: recent + prior >= 6 ? 'medium' : 'low',
    }
  }
  return latest ? { ...unknown, detail: `${latest.n} open role${latest.n === 1 ? '' : 's'} now; trend after a few weekly counts`, date: latest.d, source } : unknown
}

const NEWS_POINTS: Readonly<Record<string, number>> = { funding: 25, expansion: 18, acquisition: 10, layoffs: -30, closure: -45 }
const NEWS_LABELS: Readonly<Record<string, string>> = { funding: 'funding', expansion: 'expansion', acquisition: 'acquisition', layoffs: 'layoffs', closure: 'closure' }

/**
 * Funding / expansion / new office / acquisition news in the last 12
 * months is positive, layoffs and closure negative. Each KIND of event
 * counts once: press volume (how famous a company is) never adds points.
 * No classified event = unknown, not "no growth".
 */
export function newsSignal(events: readonly NewsEvent[], now: Date): GrowthSignal {
  const since = now.getTime() - 365 * DAY
  const recent = events.filter((e) => e.c in NEWS_POINTS && new Date(`${e.d}T00:00:00Z`).getTime() >= since)
  if (recent.length === 0) {
    return { kind: 'news', score: null, detail: 'No funding, expansion or layoff news found in the last 12 months', source: 'GDELT news, company reputation', date: null, confidence: 'low' }
  }
  const kinds = [...new Set(recent.map((e) => e.c))]
  const score = round(50 + kinds.reduce((s, k) => s + (NEWS_POINTS[k] ?? 0), 0))
  const newest = [...recent].sort((a, b) => b.d.localeCompare(a.d))[0]!
  return {
    kind: 'news',
    score,
    detail: `${kinds.map((k) => NEWS_LABELS[k]).join(', ')}: “${newest.t.slice(0, 90)}”`,
    source: 'GDELT news headlines (classified by rule)',
    date: newest.d,
    confidence: 'medium',
    url: newest.u,
  }
}

/** Employee counts over time (Wikidata P1128 with point-in-time qualifiers): yearly growth rate. */
export function headcountSignal(history: ReadonlyArray<{ y: number; n: number }>, sizeBand: string | null | undefined, now: Date): GrowthSignal {
  const pts = [...history].filter((p) => p.n > 0).sort((a, b) => a.y - b.y)
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (first && last && last.y - first.y >= 1) {
    const years = last.y - first.y
    const cagr = Math.pow(last.n / first.n, 1 / years) - 1
    const age = now.getUTCFullYear() - last.y
    return {
      kind: 'headcount',
      score: trendScore(cagr, 3),
      detail: `${first.n.toLocaleString('en-US')} employees in ${first.y} → ${last.n.toLocaleString('en-US')} in ${last.y}`,
      source: 'Wikidata employee counts with dates',
      date: `${last.y}-12-31`,
      confidence: age <= 2 ? 'high' : age <= 4 ? 'medium' : 'low',
    }
  }
  const detail = sizeBand ? `Size ${sizeBand} employees (a band, no trend)` : 'No dated employee counts'
  return { kind: 'headcount', score: null, detail, source: sizeBand ? 'Stated size band' : 'Wikidata', date: null, confidence: 'low' }
}

/** Public commit activity, last 13 weeks vs the 13 before, plus new repos (stars are never scored). */
export function engineeringSignal(gh: GithubActivity | undefined, login: string | undefined): GrowthSignal {
  if (!gh || gh.c90 + gh.cp90 + gh.nr90 + gh.nrp90 === 0) {
    return { kind: 'engineering', score: null, detail: login ? 'No recent public commits measured' : 'No GitHub organisation known', source: 'GitHub', date: gh?.at ?? null, confidence: 'low' }
  }
  const g = relChange(gh.c90, gh.cp90, 10)
  const repos = clamp(gh.nr90 * 3 - gh.nrp90, -6, 10)
  return {
    kind: 'engineering',
    score: round(50 + 40 * Math.tanh(g) + repos),
    detail: `${gh.c90} commits in the last 90 days vs ${gh.cp90} the 90 before; ${gh.nr90} new repo${gh.nr90 === 1 ? '' : 's'}`,
    source: 'GitHub public repos (weekly)',
    date: gh.at,
    confidence: gh.c90 + gh.cp90 >= 20 ? 'medium' : 'low',
    ...(login ? { url: `https://github.com/${login}` } : {}),
  }
}

/** Launches on AI Radar's "What's new" and the trend of Hacker News mentions (not their number). */
export function momentumSignal(input: { launches: ReadonlyArray<{ d: string; u: string; t: string }>; hn?: { at: string; r: number; p: number } }, now: Date): GrowthSignal {
  const since = now.getTime() - 90 * DAY
  const launches = input.launches.filter((l) => new Date(`${l.d}T00:00:00Z`).getTime() >= since)
  const hn = input.hn && input.hn.r + input.hn.p >= 2 ? input.hn : null
  if (launches.length === 0 && !hn) {
    return { kind: 'momentum', score: null, detail: 'No launches or mention trend found', source: "AI Radar what's new, Hacker News", date: null, confidence: 'low' }
  }
  const launchPts = Math.min(2, launches.length) * 12
  const hnPts = hn ? 20 * Math.tanh(relChange(hn.r, hn.p, 2)) : 0
  const parts = [
    launches.length > 0 ? `${launches.length} launch${launches.length === 1 ? '' : 'es'} in 90 days (“${launches[0]!.t.slice(0, 60)}”)` : null,
    hn ? `Hacker News mentions: ${hn.r} in the last 6 months vs ${hn.p} before` : null,
  ].filter(Boolean)
  return {
    kind: 'momentum',
    score: round(50 + launchPts + hnPts),
    detail: parts.join('; '),
    source: launches.length > 0 ? "AI Radar what's new" : 'Hacker News (Algolia)',
    date: launches[0]?.d ?? hn?.at ?? null,
    confidence: 'low',
    ...(launches[0] ? { url: launches[0].u } : {}),
  }
}

const COHORT_LABELS: Readonly<Record<string, string>> = {
  'directory:flat6labs': 'Flat6Labs portfolio',
  'directory:startup-bahrain': 'StartUp Bahrain',
}

/** "W24" / "Summer 2024" → 2024. */
export function batchYear(batch: string | undefined): number | null {
  const m = /(\d{4})|\b[WSFX](\d{2})\b/i.exec(batch ?? '')
  if (!m) return null
  return m[1] ? Number(m[1]) : 2000 + Number(m[2])
}

/**
 * Stage and age: young companies with recent funding or a recent
 * accelerator cohort have the most growth potential. Any accelerator counts
 * the same (a YC badge is not worth more than a Flat6Labs one).
 */
export function stageSignal(input: { founded?: number; ycBatch?: string; sourceTags: readonly string[]; funded: boolean }, now: Date): GrowthSignal {
  const year = now.getUTCFullYear()
  const cohortYear = batchYear(input.ycBatch)
  const cohortTag = input.sourceTags.find((t) => t in COHORT_LABELS)
  // An accelerator listing counts as a recent cohort only for a young company (the lists do not date the cohort).
  const youngListed = !!cohortTag && !!input.founded && year - input.founded <= 5
  const recentCohort = (cohortYear !== null && year - cohortYear <= 3) || youngListed
  if (!input.founded && !recentCohort) {
    return { kind: 'stage', score: null, detail: 'Founding year not known', source: 'Wikidata, YC, accelerator lists', date: null, confidence: 'low' }
  }
  const age = input.founded ? year - input.founded : null
  let score = age === null ? 55 : age <= 3 ? 62 : age <= 8 ? 58 : age <= 20 ? 50 : 45
  if (recentCohort) score += 10
  if (input.funded && (age === null || age <= 10)) score += 15
  const parts = [
    age !== null ? `founded ${input.founded} (${age} year${age === 1 ? '' : 's'} ago)` : null,
    cohortYear !== null ? `accelerator batch ${input.ycBatch}` : cohortTag ? COHORT_LABELS[cohortTag] : null,
    input.funded ? 'recent funding' : null,
  ].filter(Boolean)
  return { kind: 'stage', score: round(score), detail: parts.join(' · '), source: 'Wikidata / YC / accelerator listing', date: null, confidence: input.founded ? 'medium' : 'low' }
}
