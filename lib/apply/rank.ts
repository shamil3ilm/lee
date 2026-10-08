import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { blendScores, scoreText } from '@/lib/discovery/match/blend'
import type { FeedbackAdjust } from './feedback'

/**
 * The daily shortlist's composite rank. Pure and explainable: the score is
 * a sum of listed parts (each one a reason chip), clamped to 0–100.
 *
 *   match       0.5 × the ranked match (0–50): the deterministic Match Score,
 *               the AI score, or their mean when both exist
 *               (lib/discovery/match/blend.ts); neither → 25, "Not scored yet"
 *   role fit    +12 when a role family is one of the user's targets
 *   region fit  +8 when a region tag is one of the user's targets
 *   reputation  (avg of the CONFIRMED company criteria − 50) / 5, −10…+10
 *   pay         −10 below the user's range; +3 when pay is stated and fits
 *   soft rules  −5 per other penalty chip (max −15), +3 per boost (max +6)
 *   freshness   +10 ≤ 1 day, +7 ≤ 3, +4 ≤ 7, +1 ≤ 14 days old
 *   Scam Shield −5 at "caution"; quarantined postings are never eligible
 *   feedback    −15 a company you passed on, −8 a role / region passed on twice
 *
 * Eligibility (before ranking): passed the relevance gate (or "Show
 * anyway"), not in Scam Shield quarantine, still new or shortlisted.
 */

export type ReasonKind = 'match' | 'fit' | 'reputation' | 'pay' | 'rule' | 'fresh' | 'risk' | 'feedback'

export interface RankReason {
  kind: ReasonKind
  label: string
  points: number
}

export interface RankNotes {
  penalties?: readonly string[]
  boosts?: readonly string[]
  infos?: readonly string[]
}

export interface RankCandidate {
  id: string
  /** AI score (optional refinement). */
  matchScore: number | null
  /** Deterministic Match Score (lib/discovery/match); null until computed. */
  fitScore: number | null
  regions: readonly string[]
  families: readonly string[]
  notes: RankNotes
  postedAt: Date | null
  createdAt: Date
  riskLevel: 'safe' | 'caution' | 'likely_scam' | null
  quarantined: boolean
  /** Failed the relevance gate and was not restored with "Show anyway". */
  filtered: boolean
  /** Confirmed reputation criteria (null = unknown); null when no record. */
  reputation: { environment: number | null; stability: number | null } | null
  feedback: readonly FeedbackAdjust[]
}

export interface RankContext {
  now: Date
  targetFamilies: readonly string[]
  /** Region tags ('ae' | 'gcc' | 'in' | 'remote') the user targets. */
  targetRegions: readonly string[]
}

export interface RankedCandidate {
  id: string
  score: number
  reasons: RankReason[]
}

export const RANK_WEIGHTS = {
  match: 0.5,
  unscoredMatch: 25,
  roleFit: 12,
  regionFit: 8,
  reputationMax: 10,
  payBelow: -10,
  payStated: 3,
  penalty: -5,
  penaltyMax: -15,
  boost: 3,
  boostMax: 6,
  caution: -5,
} as const

const DAY_MS = 24 * 60 * 60 * 1000
const REGION_LABELS: Readonly<Record<string, string>> = { ae: 'UAE', gcc: 'GCC', in: 'India', remote: 'Remote' }

const isPay = (s: string): boolean => s.toLowerCase().startsWith('pay:')

export function isEligible(c: Pick<RankCandidate, 'quarantined' | 'filtered'>): boolean {
  return !c.quarantined && !c.filtered
}

/** The one match number the rank uses: Match, AI, or their mean. */
export function rankedMatch(c: Pick<RankCandidate, 'matchScore' | 'fitScore'>): number | null {
  const clamp = (n: number | null): number | null => (n === null ? null : Math.max(0, Math.min(100, n)))
  return blendScores(clamp(c.fitScore), clamp(c.matchScore))
}

function matchReason(c: RankCandidate): RankReason {
  const ranked = rankedMatch(c)
  if (ranked === null) return { kind: 'match', label: 'Not scored yet', points: RANK_WEIGHTS.unscoredMatch }
  return { kind: 'match', label: scoreText(c.fitScore, c.matchScore), points: Math.round(ranked * RANK_WEIGHTS.match) }
}

function fitReasons(c: RankCandidate, ctx: RankContext): RankReason[] {
  const out: RankReason[] = []
  const family = c.families.find((f) => ctx.targetFamilies.includes(f))
  if (family) out.push({ kind: 'fit', label: `Role: ${roleFamilyLabel(family)}`, points: RANK_WEIGHTS.roleFit })
  const region = ctx.targetRegions.find((r) => c.regions.includes(r))
  if (region) out.push({ kind: 'fit', label: `Region: ${REGION_LABELS[region] ?? region}`, points: RANK_WEIGHTS.regionFit })
  return out
}

function reputationReason(c: RankCandidate): RankReason[] {
  const rep = c.reputation
  if (!rep) return []
  const known = [
    rep.environment !== null ? { label: 'environment', v: rep.environment } : null,
    rep.stability !== null ? { label: 'stability', v: rep.stability } : null,
  ].filter((x): x is { label: string; v: number } => x !== null)
  if (known.length === 0) return []
  const avg = known.reduce((s, k) => s + k.v, 0) / known.length
  const max = RANK_WEIGHTS.reputationMax
  const points = Math.max(-max, Math.min(max, Math.round((avg - 50) / 5)))
  return [{ kind: 'reputation', label: `Company ${known.map((k) => `${k.label} ${k.v}`).join(', ')}`, points }]
}

function payReasons(notes: RankNotes): RankReason[] {
  const below = (notes.penalties ?? []).find((p) => isPay(p))
  if (below) return [{ kind: 'pay', label: 'Pay below your range', points: RANK_WEIGHTS.payBelow }]
  const stated = (notes.infos ?? []).find((i) => isPay(i))
  return stated ? [{ kind: 'pay', label: `Pay stated (${stated.slice(4).trim()})`, points: RANK_WEIGHTS.payStated }] : []
}

function ruleReasons(notes: RankNotes): RankReason[] {
  const penalties = (notes.penalties ?? []).filter((p) => !isPay(p))
  const boosts = notes.boosts ?? []
  const out: RankReason[] = []
  let used = 0
  for (const p of penalties) {
    if (used <= RANK_WEIGHTS.penaltyMax) break
    const points = Math.max(RANK_WEIGHTS.penalty, RANK_WEIGHTS.penaltyMax - used)
    out.push({ kind: 'rule', label: p, points })
    used += points
  }
  let gained = 0
  for (const b of boosts) {
    if (gained >= RANK_WEIGHTS.boostMax) break
    const points = Math.min(RANK_WEIGHTS.boost, RANK_WEIGHTS.boostMax - gained)
    out.push({ kind: 'rule', label: b, points })
    gained += points
  }
  return out
}

/** Freshness from the posting date (else when lee first saw it). */
export function freshnessReason(postedAt: Date | null, createdAt: Date, now: Date): RankReason | null {
  const posted = postedAt && postedAt.getTime() <= now.getTime() ? postedAt : null
  const at = posted ?? createdAt
  const days = Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS))
  const verb = posted ? 'Posted' : 'Found'
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  const points = days <= 1 ? 10 : days <= 3 ? 7 : days <= 7 ? 4 : days <= 14 ? 1 : 0
  return points > 0 ? { kind: 'fresh', label: `${verb} ${when}`, points } : null
}

export function rankCandidate(c: RankCandidate, ctx: RankContext): RankedCandidate {
  const fresh = freshnessReason(c.postedAt, c.createdAt, ctx.now)
  const reasons: RankReason[] = [
    matchReason(c),
    ...fitReasons(c, ctx),
    ...reputationReason(c),
    ...payReasons(c.notes),
    ...ruleReasons(c.notes),
    ...(fresh ? [fresh] : []),
    ...(c.riskLevel === 'caution' ? [{ kind: 'risk' as const, label: 'Scam Shield: caution', points: RANK_WEIGHTS.caution }] : []),
    ...c.feedback.map((f) => ({ kind: 'feedback' as const, label: f.label, points: f.points })),
  ]
  const total = reasons.reduce((s, r) => s + r.points, 0)
  return { id: c.id, score: Math.max(0, Math.min(100, Math.round(total))), reasons }
}

/** Reasons in display order: biggest effect first, the match score always first. */
export function displayReasons(reasons: readonly RankReason[]): RankReason[] {
  const match = reasons.filter((r) => r.kind === 'match')
  const rest = reasons.filter((r) => r.kind !== 'match').sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
  return [...match, ...rest]
}

/**
 * Rank every eligible candidate and keep the top `n`. Ties: higher ranked
 * match (Match / AI blend), then newer, then id (deterministic).
 */
export function buildShortlist(
  candidates: readonly RankCandidate[],
  ctx: RankContext,
  n: number,
): Array<RankedCandidate & { rank: number }> {
  const byId = new Map(candidates.map((c) => [c.id, c] as const))
  return candidates
    .filter(isEligible)
    .map((c) => rankCandidate(c, ctx))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ca = byId.get(a.id)!
      const cb = byId.get(b.id)!
      const ma = rankedMatch(ca) ?? -1
      const mb = rankedMatch(cb) ?? -1
      if (mb !== ma) return mb - ma
      const ta = ca.createdAt.getTime()
      const tb = cb.createdAt.getTime()
      if (tb !== ta) return tb - ta
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .slice(0, Math.max(0, n))
    .map((r, i) => ({ ...r, reasons: displayReasons(r.reasons), rank: i + 1 }))
}
