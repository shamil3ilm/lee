import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companies, discoveries, jobRiskAssessments, jobs, sources } from '@/lib/db/schema'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import type {
  AssessmentWrite,
  RiskAssessmentRow,
  RiskTargetType,
  UserVerdict,
} from '@/lib/db/queries/riskAssessments'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import type { AllowListEntry } from '@/lib/db/queries/scamAllowList'
import type { DomainCacheRow } from '@/lib/db/queries/scamDomainCache'
import { runAfterResponse } from '@/lib/server/after-response'
import * as profileQ from '@/lib/db/queries/profile'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { logger } from '@/lib/logger'
import { allowListEntriesFor, matchesAllowList } from './allow-list'
import { assessScam } from './engine'
import { inputFromJob, inputFromNormalizedJob } from './input'
import { preloadNetCache, resolveNetContext, type NetBudget, type NetMode } from './net-cache'
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
  /** The user's allow-list, when the caller already loaded it for a batch. */
  allowList?: readonly AllowListEntry[]
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
  const allow = opts.allowList ?? (await allowQ.list(userId))
  const write = await computeAssessment(input, opts, allow)
  return riskQ.upsert(userId, targetType, targetId, write)
}

/** Rules + (cached/fetched) net facts + allow-list → the row to store. No writes. */
async function computeAssessment(
  input: ScamInput,
  opts: AssessOptions & { preloaded?: ReadonlyMap<string, DomainCacheRow> },
  allow: readonly AllowListEntry[],
): Promise<AssessmentWrite> {
  const net = await resolveNetContext(input, {
    mode: opts.net ?? 'off',
    budget: opts.budget,
    deps: opts.deps,
    now: opts.now,
    preloaded: opts.preloaded,
  })
  const result = assessScam(input, net)
  return {
    score: result.score,
    level: result.level,
    signals: result.signals,
    rulesVersion: result.rulesVersion,
    net,
    allowListed: matchesAllowList(input, result.signals, allow),
  }
}

/**
 * Assess a batch of targets whose inputs are already in memory: the
 * allow-list is loaded at most once, cached net facts once (in 'cache' mode),
 * and every row is written by a single upsert.
 */
async function assessBatch(
  userId: string,
  targetType: RiskTargetType,
  targets: ReadonlyArray<{ id: string; input: ScamInput }>,
  opts: AssessOptions,
): Promise<number> {
  if (targets.length === 0) return 0
  const allow = opts.allowList ?? (await allowQ.list(userId))
  const mode = opts.net ?? 'off'
  // 'fetch' mode refreshes per domain against the shared budget, so it keeps
  // its own per-input cache read; 'cache' mode reads the cache once.
  const preloaded = mode === 'cache' ? await preloadNetCache(targets.map((t) => t.input), mode) : undefined
  const writes = []
  for (const t of targets) {
    writes.push({
      targetType,
      targetId: t.id,
      data: await computeAssessment(t.input, { ...opts, preloaded }, allow),
    })
  }
  await riskQ.upsertMany(userId, writes)
  return writes.length
}

/**
 * v18 — assess freshly ingested job discoveries straight from the adapter's
 * normalized payload (no read-back of the rows just inserted).
 */
export async function assessNewDiscoveries(
  userId: string,
  entries: ReadonlyArray<{ id: string; normalized: Partial<NormalizedJob>; sourceName: string | null }>,
  opts: AssessOptions = {},
): Promise<number> {
  const targets = entries.flatMap((e) =>
    e.normalized.kind && e.normalized.kind !== 'job'
      ? []
      : [{ id: e.id, input: inputFromNormalizedJob(e.normalized, e.sourceName) }],
  )
  return assessBatch(userId, 'discovery', targets, opts)
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

/** Inputs for many job discoveries in one query (non-job rows are skipped). */
async function discoveryInputs(userId: string, ids: readonly string[]): Promise<Map<string, ScamInput>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: discoveries.id, normalized: discoveries.normalized, sourceName: sources.name })
    .from(discoveries)
    .leftJoin(sources, eq(sources.id, discoveries.sourceId))
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.id, [...ids])))
  const out = new Map<string, ScamInput>()
  for (const row of rows) {
    const n = (row.normalized ?? {}) as Partial<NormalizedJob>
    if (n.kind && n.kind !== 'job') continue
    out.set(row.id, inputFromNormalizedJob(n, row.sourceName))
  }
  return out
}

/** Inputs for many jobs in one query. */
async function jobInputs(userId: string, ids: readonly string[]): Promise<Map<string, ScamInput>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ job: jobs, company: companies })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobs.userId, userId), inArray(jobs.id, [...ids])))
  return new Map(rows.map((r) => [r.job.id, inputFromJob(r.job, r.company)]))
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
  opts: { limit?: number; allowList?: readonly AllowListEntry[] } = {},
): Promise<number> {
  const ids = await riskQ.staleDiscoveryIds(userId, RULES_VERSION, opts.limit ?? DEFAULT_STALE_LIMIT)
  if (ids.length === 0) return 0
  const inputs = await discoveryInputs(userId, ids)
  const targets = ids.flatMap((id) => {
    const input = inputs.get(id)
    return input ? [{ id, input }] : []
  })
  return (
    (await safely('reassess_discoveries', () =>
      assessBatch(userId, 'discovery', targets, { net: 'cache', allowList: opts.allowList }),
    )) ?? 0
  )
}

/**
 * Assessment for a job page. Renders whatever is stored; when that row is
 * missing, from an older rules version, or older than the job's last
 * update, the re-assessment is scheduled after the response (`after()`)
 * instead of writing during the render. Outside a request (tests, scripts)
 * the re-assessment runs inline and its fresh row is returned.
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
  let reassessed: RiskAssessmentRow | null = null
  await runAfterResponse('scam.ensure_job_assessment', async () => {
    reassessed = await assessAndStore(userId, 'job', jobId, loaded.input, { net: 'cache' })
  })
  return reassessed ?? existing
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
  // Two batched input loads instead of one query per candidate.
  const idsOf = (t: RiskTargetType) => candidates.filter((c) => c.targetType === t).map((c) => c.targetId)
  const inputs: Record<RiskTargetType, Map<string, ScamInput>> = {
    discovery: await discoveryInputs(userId, idsOf('discovery')),
    job: await jobInputs(userId, idsOf('job')),
  }
  const byType: Record<RiskTargetType, string[]> = { discovery: [], job: [] }
  for (const c of candidates) {
    const type = c.targetType as RiskTargetType
    const input = inputs[type]?.get(c.targetId)
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
      await allowQ.addMany(userId, allowListEntriesFor(input))
      await applyAllowListToQuarantine(userId)
    }
  }
  return (await riskQ.get(userId, targetType, targetId)) ?? updated
}
