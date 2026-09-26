import { db } from '@/lib/db/client'
import type { AIProvider } from '@/lib/ai'
import type { UserProfile } from '@/lib/db/queries/profile'
import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discQ from '@/lib/db/queries/discoveries'
import * as compDiscQ from '@/lib/db/queries/companyDiscoveries'
import * as jobsQ from '@/lib/db/queries/jobs'
import * as companiesQ from '@/lib/db/queries/companies'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import { addWatchedCompany } from '@/lib/companies/service'
import { getAdapter } from './adapters'
import type { NormalizedCompany, NormalizedJob } from './adapters/types'
import { ingestCompanyItems, ingestJobItems, type ScamCtx, type ScoringBudget } from './ingest'
import { checkDiscoveryScoringSignal } from '@/lib/ai/signal'
import { writeSkipLog } from '@/lib/ai/log'
import type { Source } from '@/lib/db/queries/sources'
import type { Discovery } from '@/lib/db/queries/discoveries'
import type { CompanyDiscovery } from '@/lib/db/queries/companyDiscoveries'
import type { Application } from '@/lib/db/queries/applications'
import {
  NET_LOOKUPS_PER_CYCLE,
  assessJob,
  netModeForUser,
  reassessStaleDiscoveries,
  safely,
} from '@/lib/scam/service'

export interface DiscoveryCycleResult {
  sourcesPolled: number
  newJobDiscoveries: number
  newCompanyDiscoveries: number
  errors: Array<{ sourceId: string; message: string }>
  // v10 — set when the per-user signal check refuses scoring (thin profile).
  // Discoveries are still ingested, just not scored. Surfaced in the cron
  // response so operators can see which users are being skipped.
  signalCheck?: {
    skipped: boolean
    code?: string
    message?: string
  }
  /**
   * True when the caller's deadline cut the cycle short (sources not polled,
   * or AI scoring stopped). Unscored rows are picked up on the next run.
   */
  budgetExhausted?: boolean
}

const CONCURRENCY = 4
/** A source with this many consecutive poll errors is skipped until fixed. */
export const MAX_ERRORS_BEFORE_SKIP = 5
/**
 * AI scoring calls per source per run. A first poll of a big board can
 * return hundreds of postings; the rest stay unscored (match_score NULL)
 * and are scored on later runs, a batch at a time.
 */
export const MAX_SCORED_PER_SOURCE = 30

/**
 * One end-to-end poll of every enabled source for `userId`: for each source,
 * call its adapter, bulk-insert the items it has not seen, and score new
 * items plus rows an earlier run left unscored (capped, see ingest.ts).
 * Never aborts on a per-source failure — the caller gets an aggregate report.
 */
export async function runDiscoveryCycleForUser(args: {
  userId: string
  ai: AIProvider
  /**
   * Epoch ms after which no new source is started and no further AI
   * scoring call is made. Ingestion of an already-fetched source finishes.
   */
  deadline?: number
}): Promise<DiscoveryCycleResult> {
  const { userId, ai } = args
  const deadline = args.deadline ?? Number.POSITIVE_INFINITY
  const { active, scoringProfile, signalSkip } = await loadCycleContext(userId)

  const result: DiscoveryCycleResult = {
    sourcesPolled: 0,
    newJobDiscoveries: 0,
    newCompanyDiscoveries: 0,
    errors: [],
  }

  // Surfaced in the response; the skip is logged once per cycle.
  if (signalSkip) {
    result.signalCheck = { skipped: true, code: signalSkip.code, message: signalSkip.message }
    await writeSkipLog({ userId, provider: 'unknown', kind: 'discovery_scoring' }, signalSkip.code)
  }

  // v17 §1 — Scam Shield: network checks only when the user enabled them;
  // one lookup budget is shared by every source in this cycle.
  const scam = await loadScamCtx(userId, NET_LOOKUPS_PER_CYCLE)

  await inBatches(active, CONCURRENCY, async (source) => {
    if (Date.now() >= deadline) {
      result.budgetExhausted = true
      return
    }
    try {
      const perSource = await pollSource({ userId, source, ai, profile: scoringProfile, scam, deadline })
      result.sourcesPolled += 1
      result.newJobDiscoveries += perSource.newJobs
      result.newCompanyDiscoveries += perSource.newCompanies
      if (perSource.budgetExhausted) result.budgetExhausted = true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      result.errors.push({ sourceId: source.id, message })
      await sourcesQ.setPolled(userId, source.id, message)
    }
  })

  // Rows from an older RULES_VERSION (or pre-Scam-Shield) get re-assessed.
  // DB-only and bounded, but still skipped once the time box is spent.
  if (Date.now() < deadline) {
    await safely('reassess_stale', () =>
      reassessStaleDiscoveries(userId, { allowList: scam.allowList }),
    )
  }

  return result
}

interface CycleContext {
  active: Source[]
  scoringProfile: UserProfile | null
  signalSkip?: { code: string; message: string }
}

/** Enabled sources that are not failing, plus the v10 scoring signal gate. */
async function loadCycleContext(userId: string): Promise<CycleContext> {
  const profile = await profileQ.get(userId)
  const sources = await sourcesQ.list(userId, { enabled: true })
  const active = sources.filter((s) => s.errorCount < MAX_ERRORS_BEFORE_SKIP)
  // v10 — signal-check gate. If the user's profile is too thin to produce
  // grounded match scores, we still ingest fresh discoveries but skip the
  // AI scoring pass entirely.
  const signal = checkDiscoveryScoringSignal(profile)
  if (signal.ok) return { active, scoringProfile: profile }
  return { active, scoringProfile: null, signalSkip: { code: signal.code, message: signal.message } }
}

/** Scam Shield context; the allow-list is loaded once, not per item. */
async function loadScamCtx(userId: string, netLookups: number): Promise<ScamCtx> {
  return {
    net: (await safely('net_mode', () => netModeForUser(userId))) ?? 'off',
    budget: { remaining: netLookups },
    allowList: (await safely('allow_list', () => allowQ.list(userId))) ?? [],
  }
}

export interface SourcePollResult {
  /** 'skipped' when the source is gone, disabled, failing, or out of time. */
  status: 'polled' | 'failed' | 'skipped'
  newJobDiscoveries: number
  newCompanyDiscoveries: number
  budgetExhausted: boolean
  error?: string
}

/**
 * Queue job `discovery-source` — poll ONE source: the per-source slice of
 * runDiscoveryCycleForUser with the same caps (MAX_SCORED_PER_SOURCE AI
 * scores, the caller's deadline) and error accounting (setPolled with the
 * message, so a failing source is skipped after MAX_ERRORS_BEFORE_SKIP).
 * The cycle's Scam Shield network-lookup budget is split evenly across the
 * user's active sources, so a day's total stays the same. The v10 signal
 * skip is logged once, by the user's first active source.
 */
export async function runDiscoveryForSource(args: {
  userId: string
  sourceId: string
  ai: AIProvider
  deadline?: number
}): Promise<SourcePollResult> {
  const { userId, ai } = args
  const deadline = args.deadline ?? Number.POSITIVE_INFINITY
  const empty = { newJobDiscoveries: 0, newCompanyDiscoveries: 0, budgetExhausted: false }
  const { active, scoringProfile, signalSkip } = await loadCycleContext(userId)
  const index = active.findIndex((s) => s.id === args.sourceId)
  const source = active[index]
  if (!source) return { status: 'skipped', ...empty }
  if (Date.now() >= deadline) return { status: 'skipped', ...empty, budgetExhausted: true }
  if (signalSkip && index === 0) {
    await writeSkipLog({ userId, provider: 'unknown', kind: 'discovery_scoring' }, signalSkip.code)
  }
  const scam = await loadScamCtx(userId, Math.ceil(NET_LOOKUPS_PER_CYCLE / active.length))
  try {
    const r = await pollSource({ userId, source, ai, profile: scoringProfile, scam, deadline })
    return {
      status: 'polled',
      newJobDiscoveries: r.newJobs,
      newCompanyDiscoveries: r.newCompanies,
      budgetExhausted: r.budgetExhausted,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await sourcesQ.setPolled(userId, source.id, message)
    return { status: 'failed', ...empty, error: message }
  }
}

async function pollSource(args: {
  userId: string
  source: Source
  ai: AIProvider
  profile: UserProfile | null
  scam: ScamCtx
  deadline: number
}): Promise<{ newJobs: number; newCompanies: number; budgetExhausted: boolean }> {
  const { source, deadline } = args
  const adapter = getAdapter(source.kind)
  if (!adapter) throw new Error(`no adapter registered for kind=${source.kind}`)
  const items = await adapter.fetch(source.config)
  const scoring: ScoringBudget = { remaining: MAX_SCORED_PER_SOURCE, deadline, exhausted: false }
  const ingest = { ...args, scoring }
  const newJobs = await ingestJobItems(
    ingest,
    items.filter((i) => i.normalized.kind === 'job'),
  )
  const newCompanies = await ingestCompanyItems(
    ingest,
    items.filter((i) => i.normalized.kind !== 'job'),
  )
  await sourcesQ.setPolled(args.userId, source.id)
  return { newJobs, newCompanies, budgetExhausted: scoring.exhausted }
}

// ---------------------------------------------------------------------------
// Promote / dismiss flows
// ---------------------------------------------------------------------------

export interface PromoteJobResult {
  discovery: Discovery
  application: Application
}

/**
 * Turn a job discovery into a live Application by upserting Company + Job in
 * a single transaction, creating the Application, and marking the discovery
 * `saved`. All-or-nothing so a mid-flight failure leaves no half-created
 * pipeline entry.
 */
/**
 * `normalized` is persisted as jsonb, so the adapter's `postedAt: Date`
 * comes back as an ISO string. Passing that string to a timestamp column
 * threw "value.toISOString is not a function" and every Save failed for
 * sources that report a posting date (v17 §9.1 E2E journey).
 */
function postedAtDate(value: Date | string | undefined | null): Date | null {
  if (value === undefined || value === null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function promoteJobDiscovery(args: {
  userId: string
  discoveryId: string
}): Promise<PromoteJobResult> {
  const { userId, discoveryId } = args
  const disc = await discQ.getById(userId, discoveryId)
  if (!disc) throw new Error('discovery not found')
  const normalized = disc.normalized as unknown as NormalizedJob
  if (normalized.kind !== 'job') throw new Error('discovery is not a job')

  const domain = normalized.companyDomain ?? extractDomain(normalized.applyUrl)
  if (!domain) throw new Error('cannot derive company domain from discovery')

  const application = await db.transaction(async (tx) => {
    const company = await companiesQ.findOrCreateByDomain(
      userId,
      domain,
      normalized.companyName,
      tx,
    )
    const job = await jobsQ.upsertBySourceUrl(
      userId,
      company.id,
      {
        title: normalized.title,
        sourceUrl: normalized.applyUrl,
        location: normalized.location ?? null,
        remoteType: normalized.remoteType ?? null,
        employmentType: normalized.employmentType ?? null,
        salaryMin: normalized.salary?.min ?? null,
        salaryMax: normalized.salary?.max ?? null,
        salaryCurrency: normalized.salary?.currency ?? null,
        descriptionMd: normalized.descriptionMd,
        parsedMeta: { tech_stack: normalized.techStack },
        benefits: (normalized as unknown as { benefits?: Record<string, unknown> }).benefits ?? {},
        postedAt: postedAtDate(normalized.postedAt),
      },
      tx,
    )
    const app = await appsQ.create(userId, { jobId: job.id, source: 'discovery' }, tx)
    await actQ.log(userId, app.id, 'status_change', { from: null, to: 'saved' }, tx)
    await discQ.setStatus(
      userId,
      discoveryId,
      'saved',
      { savedApplicationId: app.id },
      tx,
    )
    return app
  })

  // v17 §1 — the promoted job gets its own assessment (the discovery's
  // "not a scam" verdict carries over through the allow-list).
  await safely('promoted_job', () => assessJob(userId, application.jobId))

  const updatedDiscovery = await discQ.getById(userId, discoveryId)
  return { discovery: updatedDiscovery ?? disc, application }
}

export async function promoteCompanyDiscovery(args: {
  userId: string
  discoveryId: string
}): Promise<{ discovery: CompanyDiscovery; companyId: string }> {
  const { userId, discoveryId } = args
  const disc = await compDiscQ.getById(userId, discoveryId)
  if (!disc) throw new Error('company discovery not found')
  const normalized = disc.normalized as unknown as NormalizedCompany
  const domain = normalized.domain ?? extractDomain(normalized.website)
  if (!domain) throw new Error('cannot derive company domain from discovery')
  const { company } = await addWatchedCompany({
    userId,
    name: normalized.name,
    domain,
    headquartersCountry: normalized.hqCountry,
    size: normalized.size,
    stage: normalized.stage,
  })
  await compDiscQ.setStatus(userId, discoveryId, 'saved', { addedCompanyId: company.id })
  const updated = await compDiscQ.getById(userId, discoveryId)
  return { discovery: updated ?? disc, companyId: company.id }
}

export async function dismissDiscovery(args: {
  userId: string
  discoveryId: string
}): Promise<void> {
  await discQ.setStatus(args.userId, args.discoveryId, 'dismissed')
}

export async function dismissCompanyDiscovery(args: {
  userId: string
  discoveryId: string
}): Promise<void> {
  await compDiscQ.setStatus(args.userId, args.discoveryId, 'dismissed')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function inBatches<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency)
    await Promise.allSettled(slice.map((it) => worker(it)))
  }
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
