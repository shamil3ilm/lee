import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companies, discoveries, jobRiskAssessments, jobs, sources } from '@/lib/db/schema'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import type { RiskAssessmentRow, RiskTargetType, UserVerdict } from '@/lib/db/queries/riskAssessments'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import * as profileQ from '@/lib/db/queries/profile'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { logger } from '@/lib/logger'
import { allowListEntriesFor, matchesAllowList } from './allow-list'
import { assessScam } from './engine'
import { inputFromJob, inputFromNormalizedJob } from './input'
import { resolveNetContext, type NetBudget, type NetMode } from './net-cache'
import type { NetDeps } from './net'
import type { ScamInput } from './types'
import { RULES_VERSION } from './version'

/**
 * v17 §1 — Scam Shield pipeline. Assesses discoveries on ingest and jobs on
 * create/update, stores one row per target, and re-assesses rows written by
 * an older RULES_VERSION. Nothing here deletes or hides data: quarantine is
 * a read-time filter over `job_risk_assessments` (see riskAssessments.ts).
 */

export interface AssessOptions {
  /** Network facts: 'off' (default), 'cache' (no calls) or 'fetch'. */
  net?: NetMode
  budget?: NetBudget
  deps?: NetDeps
  now?: Date
}

/** Per-cycle cap on fresh network lookups (each is ≤ 2 small requests). */
export const NET_LOOKUPS_PER_CYCLE = 15
const DEFAULT_STALE_LIMIT = 200

/** 'fetch' when the user enabled network checks in Settings, else 'off'. */
export async function netModeForUser(userId: string): Promise<NetMode> {
  const profile = await profileQ.get(userId)
  return profile?.scamNetChecks ? 'fetch' : 'off'
}

export async function assessAndStore(
  userId: string,
  targetType: RiskTargetType,
  targetId: string,
  input: ScamInput,
  opts: AssessOptions = {},
): Promise<RiskAssessmentRow> {
  const net = await resolveNetContext(input, {
    mode: opts.net ?? 'off',
    budget: opts.budget,
    deps: opts.deps,
    now: opts.now,
  })
  const result = assessScam(input, net)
  const allow = await allowQ.list(userId)
  return riskQ.upsert(userId, targetType, targetId, {
    score: result.score,
    level: result.level,
    signals: result.signals,
    rulesVersion: result.rulesVersion,
    net,
    allowListed: matchesAllowList(input, result.signals, allow),
  })
}

async function discoveryInput(userId: string, discoveryId: string): Promise<ScamInput | null> {
  const [row] = await db
    .select({ normalized: discoveries.normalized, sourceName: sources.name })
    .from(discoveries)
    .leftJoin(sources, eq(sources.id, discoveries.sourceId))
    .where(and(eq(discoveries.userId, userId), eq(discoveries.id, discoveryId)))
    .limit(1)
  if (!row) return null
  const n = (row.normalized ?? {}) as Partial<NormalizedJob>
  if (n.kind && n.kind !== 'job') return null
  return inputFromNormalizedJob(n, row.sourceName)
}

async function jobInput(userId: string, jobId: string): Promise<{ input: ScamInput; updatedAt: Date } | null> {
  const [row] = await db
    .select({ job: jobs, company: companies })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobs.userId, userId), eq(jobs.id, jobId)))
    .limit(1)
  if (!row) return null
  return { input: inputFromJob(row.job, row.company), updatedAt: row.job.updatedAt }
}

export async function assessDiscovery(
  userId: string,
  discoveryId: string,
  opts: AssessOptions = {},
): Promise<RiskAssessmentRow | null> {
  const input = await discoveryInput(userId, discoveryId)
  if (!input) return null
  return assessAndStore(userId, 'discovery', discoveryId, input, opts)
}

export async function assessJob(
  userId: string,
  jobId: string,
  opts: AssessOptions = {},
): Promise<RiskAssessmentRow | null> {
  const loaded = await jobInput(userId, jobId)
  if (!loaded) return null
  return assessAndStore(userId, 'job', jobId, loaded.input, opts)
}

/**
 * Pipeline hook: assess, but never let a Scam Shield failure break the
 * caller (ingest, job creation). Errors are logged and swallowed.
 */
export async function safely<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    logger.warn('scam.assess_failed', { what, err: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Re-assess job discoveries with no row or an older RULES_VERSION (rules + cached net only). */
export async function reassessStaleDiscoveries(
  userId: string,
  opts: { limit?: number } = {},
): Promise<number> {
  const ids = await riskQ.staleDiscoveryIds(userId, RULES_VERSION, opts.limit ?? DEFAULT_STALE_LIMIT)
  let n = 0
  for (const id of ids) {
    const row = await safely('reassess_discovery', () => assessDiscovery(userId, id, { net: 'cache' }))
    if (row) n += 1
  }
  return n
}

/**
 * Current assessment for a job, re-assessed first when missing, written by
 * an older rules version, or older than the job's last update.
 */
export async function ensureJobAssessment(userId: string, jobId: string): Promise<RiskAssessmentRow | null> {
  const loaded = await jobInput(userId, jobId)
  if (!loaded) return null
  const existing = await riskQ.get(userId, 'job', jobId)
  const fresh =
    existing &&
    existing.rulesVersion === RULES_VERSION &&
    existing.updatedAt.getTime() >= loaded.updatedAt.getTime()
  if (fresh) return existing
  return assessAndStore(userId, 'job', jobId, loaded.input, { net: 'cache' })
}

// ---------------------------------------------------------------------------
// User verdicts + allow-list
// ---------------------------------------------------------------------------

async function inputFor(userId: string, targetType: RiskTargetType, targetId: string): Promise<ScamInput | null> {
  if (targetType === 'discovery') return discoveryInput(userId, targetId)
  return (await jobInput(userId, targetId))?.input ?? null
}

/**
 * After new allow-list entries, flag this user's other quarantine
 * candidates that now match, so they leave quarantine too. Bounded.
 */
async function applyAllowListToQuarantine(userId: string): Promise<void> {
  const entries = await allowQ.list(userId)
  const candidates = await db
    .select({
      targetType: jobRiskAssessments.targetType,
      targetId: jobRiskAssessments.targetId,
      signals: jobRiskAssessments.signals,
    })
    .from(jobRiskAssessments)
    .where(
      and(
        eq(jobRiskAssessments.userId, userId),
        eq(jobRiskAssessments.level, 'likely_scam'),
        eq(jobRiskAssessments.allowListed, false),
      ),
    )
    .limit(500)
  const byType: Record<RiskTargetType, string[]> = { discovery: [], job: [] }
  for (const c of candidates) {
    const type = c.targetType as RiskTargetType
    const input = await inputFor(userId, type, c.targetId)
    if (input && matchesAllowList(input, c.signals as never, entries)) byType[type].push(c.targetId)
  }
  await riskQ.markAllowListed(userId, 'discovery', byType.discovery)
  await riskQ.markAllowListed(userId, 'job', byType.job)
}

export class AssessmentNotFoundError extends Error {
  constructor() {
    super('assessment not found')
  }
}

/**
 * Record the user's decision. "not_scam" un-quarantines the item and
 * remembers its domains + company in the allow-list; "confirmed_scam"
 * keeps it quarantined. `null` clears the verdict. Nothing is deleted.
 */
export async function setUserVerdict(
  userId: string,
  targetType: RiskTargetType,
  targetId: string,
  verdict: UserVerdict | null,
): Promise<RiskAssessmentRow> {
  let row = await riskQ.get(userId, targetType, targetId)
  if (!row) {
    // Never assessed yet (e.g. created before Scam Shield) — assess first.
    row =
      targetType === 'discovery' ? await assessDiscovery(userId, targetId) : await assessJob(userId, targetId)
  }
  if (!row) throw new AssessmentNotFoundError()
  const updated = await riskQ.setVerdict(userId, targetType, targetId, verdict)
  if (!updated) throw new AssessmentNotFoundError()
  if (verdict === 'not_scam') {
    const input = await inputFor(userId, targetType, targetId)
    if (input) {
      for (const e of allowListEntriesFor(input)) await allowQ.add(userId, e.kind, e.value)
      await applyAllowListToQuarantine(userId)
    }
  }
  return (await riskQ.get(userId, targetType, targetId)) ?? updated
}
