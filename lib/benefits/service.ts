import type { UserProfile } from '@/lib/db/queries/profile'
import * as profileQ from '@/lib/db/queries/profile'
import * as benefitsQ from '@/lib/db/queries/discoveryBenefits'
import { fnv1a } from '@/lib/cv-fit/key'
import { extractBenefits, type ExtractedBenefits, type PostingForBenefits } from './extract'
import { effectiveWeights, scoreBenefits, type BenefitItem, type PayFloorInput } from './score'

/**
 * Benefits rules version. Bump on ANY change to the extraction patterns,
 * labels, weights or scoring: the key below changes, and the daily
 * `discovery-benefits:user` job re-extracts every row stored under an
 * older key (lib/queue/handlers.ts).
 */
export const BENEFITS_VERSION = 'b1'

export interface BenefitsContext {
  weights: Record<string, number>
  floor: PayFloorInput | null
  /** Version + fingerprint of the weights and floor the rows are scored with. */
  key: string
}

/**
 * What `discoveries.benefits_detail` stores (≈ 0.5–1.5 KB): stated items
 * only; labels come from BENEFIT_LABELS (lib/benefits/score.ts) on read.
 */
export interface BenefitsDetail {
  v: string
  coverage: number
  explanation: string
  items: Array<Pick<BenefitItem, 'key' | 'points' | 'state' | 'quote'>>
  salary: ExtractedBenefits['salary']
  leaveDays: number | null
}

export interface BenefitsColumns {
  benefitsScore: number | null
  benefitsDetail: BenefitsDetail
  benefitsKey: string
}

function readWeights(profile: UserProfile | null): Record<string, number> {
  const w = (profile?.benefitPrefs as { weights?: unknown } | null | undefined)?.weights
  if (!w || typeof w !== 'object') return {}
  return Object.fromEntries(
    Object.entries(w as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])),
  )
}

export function benefitsContextFor(profile: UserProfile | null): BenefitsContext {
  const weights = effectiveWeights(readWeights(profile))
  const floor =
    profile?.compFloorAnnual && profile.compFloorAnnual > 0 && profile.compCurrency
      ? { annual: profile.compFloorAnnual, currency: profile.compCurrency.toUpperCase() }
      : null
  const fingerprint = JSON.stringify([Object.entries(weights).sort(([a], [b]) => a.localeCompare(b)), floor])
  return { weights, floor, key: `${BENEFITS_VERSION}:${fnv1a(fingerprint)}` }
}

/** Extract + score one posting into the columns stored on its discovery row. */
export function benefitsColumns(posting: PostingForBenefits, ctx: BenefitsContext): BenefitsColumns {
  const extracted = extractBenefits(posting)
  const scored = scoreBenefits(extracted, ctx.weights, ctx.floor)
  return {
    benefitsScore: scored.score,
    benefitsKey: ctx.key,
    benefitsDetail: {
      v: BENEFITS_VERSION,
      coverage: scored.coverage,
      explanation: scored.explanation,
      items: scored.items
        .filter((i) => i.state !== 'unknown')
        .map(({ key, points, state, quote }) => ({ key, points, state, ...(quote ? { quote } : {}) })),
      salary: extracted.salary,
      leaveDays: extracted.leaveDays,
    },
  }
}

/** The posting fields benefits are read from, from a stored `normalized` payload. */
export function postingFromNormalized(normalized: unknown, pastedJd: string | null): PostingForBenefits {
  const n = (normalized ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  const salary = n.salary && typeof n.salary === 'object' ? (n.salary as PostingForBenefits['salary']) : null
  return { title: str(n.title), descriptionMd: str(n.descriptionMd), remoteType: str(n.remoteType), salary, pastedJd }
}

export const BENEFITS_BATCH = 200

export interface BenefitsBackfillResult {
  updated: number
  /** More stale rows are left (the deadline or `maxRows` stopped the run). */
  more: boolean
}

/**
 * Re-extract every discovery row of `userId` stored under another key, in
 * batches, until none is left, `maxRows` rows were written or `deadline`
 * (epoch ms) passes. DB-only and idempotent.
 */
export async function backfillBenefits(
  userId: string,
  opts: { deadline?: number; maxRows?: number; now?: () => number } = {},
): Promise<BenefitsBackfillResult> {
  const now = opts.now ?? Date.now
  const maxRows = opts.maxRows ?? 5_000
  const ctx = benefitsContextFor(await profileQ.get(userId))
  let updated = 0
  for (;;) {
    if (updated >= maxRows || (opts.deadline !== undefined && now() >= opts.deadline)) {
      return { updated, more: (await benefitsQ.staleRows(userId, ctx.key, 1)).length > 0 }
    }
    const rows = await benefitsQ.staleRows(userId, ctx.key, Math.min(BENEFITS_BATCH, maxRows - updated))
    if (rows.length === 0) return { updated, more: false }
    await benefitsQ.writeMany(
      userId,
      rows.map((r) => ({ id: r.id, ...benefitsColumns(postingFromNormalized(r.normalized, r.pastedJd), ctx) })),
    )
    updated += rows.length
  }
}
