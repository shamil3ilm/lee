import type { AIProvider } from '@/lib/ai'
import type { UserProfile } from '@/lib/db/queries/profile'
import * as discQ from '@/lib/db/queries/discoveries'
import * as compDiscQ from '@/lib/db/queries/companyDiscoveries'
import type { Source } from '@/lib/db/queries/sources'
import { assessNewDiscoveries, safely } from '@/lib/scam/service'
import type { AllowListEntry } from '@/lib/db/queries/scamAllowList'
import type { NetBudget, NetMode } from '@/lib/scam/net-cache'
import type { DiscoveryItem, NormalizedCompany, NormalizedJob } from './adapters/types'
import { applyCaps, benefitsScore } from './scoring'

/**
 * v18 — batched ingestion for one polled source.
 *
 *   1. One query loads which of the fetched ids this source already has
 *      (ids + a scored flag only, never the jsonb payload).
 *   2. Only unseen items are inserted, in bulk.
 *   3. AI scoring covers new items first, then rows an earlier run left
 *      unscored (match_score IS NULL) — at most `scoring.remaining` calls,
 *      and none once the deadline has passed.
 */

export interface ScamCtx {
  net: NetMode
  budget: NetBudget
  allowList: readonly AllowListEntry[]
}

/** Shared per-source scoring allowance. `exhausted` records a deadline stop. */
export interface ScoringBudget {
  remaining: number
  deadline: number
  exhausted: boolean
}

export interface IngestArgs {
  userId: string
  source: Source
  ai: AIProvider
  profile: UserProfile | null
  scam: ScamCtx
  scoring: ScoringBudget
}

function takeScoringSlot(b: ScoringBudget): boolean {
  if (b.remaining <= 0) return false
  if (Date.now() >= b.deadline) {
    b.exhausted = true
    return false
  }
  b.remaining -= 1
  return true
}

/** Last occurrence wins when an adapter repeats an id within one fetch. */
function uniqueById(items: readonly DiscoveryItem[]): DiscoveryItem[] {
  return [...new Map(items.map((i) => [i.sourceItemId, i])).values()]
}

interface ToScore<N> {
  id: string
  normalized: N
}

export async function ingestJobItems(args: IngestArgs, items: readonly DiscoveryItem[]): Promise<number> {
  const { userId, source, ai, profile, scam, scoring } = args
  const unique = uniqueById(items)
  const seen = await discQ.seenBySourceJobIds(
    source.id,
    unique.map((i) => i.sourceItemId),
  )
  const fresh = unique.filter((i) => !seen.has(i.sourceItemId))
  const inserted = await discQ.insertManyForSource(
    userId,
    source.id,
    fresh.map((i) => ({ sourceJobId: i.sourceItemId, raw: i.raw, normalized: i.normalized })),
  )
  const bySourceId = new Map(unique.map((i) => [i.sourceItemId, i.normalized as NormalizedJob]))
  const newRows: ToScore<NormalizedJob>[] = inserted.map((r) => ({
    id: r.id,
    normalized: bySourceId.get(r.sourceJobId)!,
  }))

  await safely('discovery', () =>
    assessNewDiscoveries(
      userId,
      newRows.map((r) => ({ id: r.id, normalized: r.normalized, sourceName: source.name })),
      { net: scam.net, budget: scam.budget, allowList: scam.allowList },
    ),
  )

  if (profile) {
    const retry: ToScore<NormalizedJob>[] = [...seen.values()]
      .filter((s) => s.unscored)
      .map((s) => ({ id: s.id, normalized: bySourceId.get(s.sourceJobId)! }))
    for (const row of [...newRows, ...retry]) {
      if (!takeScoringSlot(scoring)) break
      await scoreJobRow(userId, ai, profile, row)
    }
  }
  return inserted.length
}

async function scoreJobRow(
  userId: string,
  ai: AIProvider,
  profile: UserProfile,
  row: ToScore<NormalizedJob>,
): Promise<void> {
  try {
    // v10.1 — capture the ai_call_logs row id via the `onLogged` callback so
    // we can persist it onto the discovery row for later implicit-signal
    // writeback when the user dismisses or promotes the discovery.
    let capturedCallId: string | null = null
    const scored = await ai.scoreJob(row.normalized, profile, {
      userId,
      onLogged: (id) => {
        capturedCallId = id
      },
    })
    const finalScore = applyCaps(scored, row.normalized, profile)
    const benefitsRaw =
      (row.normalized as unknown as { benefits?: Record<string, unknown> }).benefits ?? {}
    const bScore = benefitsScore(benefitsRaw, readBenefitWeights(profile))
    await discQ.updateScore(userId, row.id, finalScore, bScore, scored)
    if (capturedCallId) await discQ.updateScoredByCallId(userId, row.id, capturedCallId)
  } catch {
    // Non-fatal: the row keeps match_score NULL, and the next cycle picks it
    // up again through the unscored-rows retry above (within the cap).
  }
}

export async function ingestCompanyItems(
  args: IngestArgs,
  items: readonly DiscoveryItem[],
): Promise<number> {
  const { userId, source, ai, profile, scoring } = args
  const unique = uniqueById(items)
  const seen = await compDiscQ.seenBySourceCompanyIds(
    source.id,
    unique.map((i) => i.sourceItemId),
  )
  const fresh = unique.filter((i) => !seen.has(i.sourceItemId))
  const inserted = await compDiscQ.insertManyForSource(
    userId,
    source.id,
    fresh.map((i) => ({ sourceCompanyId: i.sourceItemId, raw: i.raw, normalized: i.normalized })),
  )
  if (profile) {
    const bySourceId = new Map(unique.map((i) => [i.sourceItemId, i.normalized as NormalizedCompany]))
    const rows: ToScore<NormalizedCompany>[] = [
      ...inserted.map((r) => ({ id: r.id, normalized: bySourceId.get(r.sourceCompanyId)! })),
      ...[...seen.values()]
        .filter((s) => s.unscored)
        .map((s) => ({ id: s.id, normalized: bySourceId.get(s.sourceCompanyId)! })),
    ]
    for (const row of rows) {
      if (!takeScoringSlot(scoring)) break
      await scoreCompanyRow(userId, ai, profile, row)
    }
  }
  return inserted.length
}

async function scoreCompanyRow(
  userId: string,
  ai: AIProvider,
  profile: UserProfile,
  row: ToScore<NormalizedCompany>,
): Promise<void> {
  try {
    // v10.1 — see scoreJobRow: capture the log row id so implicit signals
    // can flow back on dismiss/save.
    let capturedCallId: string | null = null
    const scored = await ai.scoreCompany(row.normalized, profile, {
      userId,
      onLogged: (id) => {
        capturedCallId = id
      },
    })
    await compDiscQ.updateScore(userId, row.id, Math.round(scored.match_score), scored)
    if (capturedCallId) await compDiscQ.updateScoredByCallId(userId, row.id, capturedCallId)
  } catch {
    // Non-fatal — retried on the next cycle while match_score stays NULL.
  }
}

function readBenefitWeights(profile: UserProfile): Record<string, number> {
  const prefs = profile.benefitPrefs as { weights?: Record<string, number> } | null
  const w = prefs?.weights
  if (!w || typeof w !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(w)) {
    if (typeof v === 'number' && !Number.isNaN(v)) out[k] = v
  }
  return out
}
