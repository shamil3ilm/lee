import * as profileQ from '@/lib/db/queries/profile'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { FitColumns } from '@/lib/db/queries/discoveries'
import * as matchQ from '@/lib/db/queries/discoveryMatch'
import { matchKey } from './key'
import { matchProfileFrom } from './profile'
import { computeMatch } from './score'
import type { MatchJob, MatchProfile } from './types'

/**
 * Server side of the Match Score: columns for ingest, and the batched
 * backfill that re-scores rows whose `fit_key` is not the current key
 * (new rules version, or the profile's ready evidence / preferences moved).
 * DB-only and AI-free, so it is cheap to run on every view and every save.
 */

export interface MatchContext {
  profile: MatchProfile
  key: string
}

export function matchContext(profile: UserProfile | null, now: Date = new Date()): MatchContext {
  const p = matchProfileFrom(profile, now)
  return { profile: p, key: matchKey(p) }
}

export function fitColumns(job: MatchJob, ctx: MatchContext): FitColumns {
  const detail = computeMatch(job, ctx.profile)
  return { fitScore: detail.score, fitDetail: detail, fitKey: ctx.key }
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asSalary(v: unknown): MatchJob['salary'] {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as MatchJob['salary']) : null
}

export function rowToJob(r: matchQ.MatchRow): MatchJob {
  return {
    title: r.title ?? '',
    location: r.location,
    remoteType: r.remoteType,
    employmentType: r.employmentType,
    descriptionMd: r.descriptionMd,
    techStack: asStrings(r.techStack),
    salary: asSalary(r.salary),
  }
}

export interface RescoreResult {
  scored: number
  /** More stale rows remain (deadline or row cap reached). */
  remaining: boolean
}

export const RESCORE_BATCH = 200

/**
 * Re-score every discovery whose stored key differs from the current one,
 * in batches of RESCORE_BATCH (one read + one UPDATE each), until done,
 * `deadline` passes or `maxRows` were processed. When nothing stale is
 * left, the profile's applied key is stamped so page views skip the check.
 * Idempotent: rows already under the current key are never read again.
 */
export async function rescoreMatches(
  userId: string,
  opts: { deadline?: number; maxRows?: number; profile?: UserProfile | null; now?: Date } = {},
): Promise<RescoreResult> {
  const profile = opts.profile !== undefined ? opts.profile : await profileQ.get(userId)
  const ctx = matchContext(profile, opts.now)
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY
  let scored = 0
  for (;;) {
    if (Date.now() >= deadline || scored >= maxRows) return { scored, remaining: true }
    const rows = await matchQ.staleRows(userId, ctx.key, RESCORE_BATCH)
    if (rows.length === 0) break
    await matchQ.applyFitBatch(
      userId,
      rows.map((r) => ({ id: r.id, fit: fitColumns(rowToJob(r), ctx) })),
    )
    scored += rows.length
    if (rows.length < RESCORE_BATCH) break
  }
  if (profile && profile.matchAppliedKey !== ctx.key) {
    await profileQ.upsert(userId, { matchAppliedKey: ctx.key })
  }
  return { scored, remaining: false }
}

/** True when stored discoveries may carry Match Scores from an older key. */
export function matchStale(profile: UserProfile | null, now: Date = new Date()): boolean {
  if (!profile) return false
  return profile.matchAppliedKey !== matchContext(profile, now).key
}
