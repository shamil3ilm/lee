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
import type { DiscoveryItem, NormalizedCompany, NormalizedJob } from './adapters/types'
import { ingestCompanyItems, ingestJobItems, type ScamCtx, type ScoringBudget } from './ingest'
import { loadMasterCv, relevanceContext, type RelevanceContext } from './relevance/service'
import { matchContext, type MatchContext } from './match/service'
import { profileDigest } from './relevance/suggest'
import type { ScoreJobContext } from '@/lib/ai/prompts/score-job'
import { emptyPollStats, type SourcePollStats } from './poll-stats'
import { logger } from '@/lib/logger'
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
import { LINKEDIN_POST_APP_SOURCE } from '@/lib/linkedin-posts/types'

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
  const { active, scoringProfile, signalSkip, relevance, match, scoreContext } = await loadCycleContext(userId)

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
      const perSource = await pollSource({ userId, source, ai, profile: scoringProfile, scam, deadline, relevance, match, scoreContext })
      result.sourcesPolled += 1
      result.newJobDiscoveries += perSource.newJobs
      result.newCompanyDiscoveries += perSource.newCompanies
      if (perSource.budgetExhausted) result.budgetExhausted = true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      result.errors.push({ sourceId: source.id, message })
      await recordPollFailure(userId, source, message)
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
  /** Relevance gate prefs + key; applies even when scoring is skipped. */
  relevance: RelevanceContext
  /** Deterministic Match Score context (every ingested posting gets a score). */
  match: MatchContext
  /** Master-CV digest for the scoring prompt (only loaded when scoring). */
  scoreContext?: ScoreJobContext
}

/** Enabled sources that are not failing, plus the v10 scoring signal gate. */
async function loadCycleContext(userId: string): Promise<CycleContext> {
  const profile = await profileQ.get(userId)
  const sources = await sourcesQ.list(userId, { enabled: true })
  const active = sources.filter((s) => s.errorCount < MAX_ERRORS_BEFORE_SKIP)
  const relevance = relevanceContext(profile)
  const match = matchContext(profile)
  // v10 — signal-check gate. If the user's profile is too thin to produce
  // grounded match scores, we still ingest fresh discoveries but skip the
  // AI scoring pass entirely.
  const signal = checkDiscoveryScoringSignal(profile)
  if (signal.ok) {
    const masterCv = active.length > 0 ? await loadMasterCv(userId) : null
    const cvDigest = profileDigest({ profile, masterCv })
    return { active, scoringProfile: profile, relevance, match, scoreContext: { cvDigest } }
  }
  return {
    active,
    scoringProfile: null,
    signalSkip: { code: signal.code, message: signal.message },
    relevance,
    match,
  }
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
  /** The source's display name (null when it no longer exists). */
  sourceName?: string | null
  /** Counts for the run summary (zeros unless polled). */
  stats?: SourcePollStats
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
  const { active, scoringProfile, signalSkip, relevance, match, scoreContext } = await loadCycleContext(userId)
  const index = active.findIndex((s) => s.id === args.sourceId)
  const source = active[index]
  const empty = {
    newJobDiscoveries: 0,
    newCompanyDiscoveries: 0,
    budgetExhausted: false,
    sourceName: source?.name ?? null,
    stats: emptyPollStats(),
  }
  if (!source) return { status: 'skipped', ...empty }
  if (Date.now() >= deadline) return { status: 'skipped', ...empty, budgetExhausted: true }
  if (signalSkip && index === 0) {
    await writeSkipLog({ userId, provider: 'unknown', kind: 'discovery_scoring' }, signalSkip.code)
  }
  const scam = await loadScamCtx(userId, Math.ceil(NET_LOOKUPS_PER_CYCLE / active.length))
  try {
    const r = await pollSource({ userId, source, ai, profile: scoringProfile, scam, deadline, relevance, match, scoreContext })
    return {
      status: 'polled',
      newJobDiscoveries: r.newJobs,
      newCompanyDiscoveries: r.newCompanies,
      budgetExhausted: r.budgetExhausted,
      sourceName: source.name,
      stats: r.stats,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await recordPollFailure(userId, source, message)
    return { status: 'failed', ...empty, error: message }
  }
}

/** A failed poll: counted on the source (auto-skip after N) and logged. */
async function recordPollFailure(userId: string, source: Source, message: string): Promise<void> {
  await sourcesQ.setPolled(userId, source.id, message)
  logger.warn('source_poll_failed', { userId, sourceId: source.id, source: source.name, kind: source.kind, err: message })
}

async function pollSource(args: {
  userId: string
  source: Source
  ai: AIProvider
  profile: UserProfile | null
  scam: ScamCtx
  deadline: number
  relevance: RelevanceContext
  match: MatchContext
  scoreContext?: ScoreJobContext
}): Promise<{ newJobs: number; newCompanies: number; budgetExhausted: boolean; stats: SourcePollStats }> {
  const { source, deadline } = args
  const adapter = getAdapter(source.kind)
  if (!adapter) throw new Error("lee can't read this kind of source yet.")
  const started = Date.now()
  const stats = emptyPollStats()
  const items = await adapter.fetch(source.config, {
    userId: args.userId,
    report: ({ parseFailures }) => {
      if (parseFailures) stats.parseFailures = (stats.parseFailures ?? 0) + parseFailures
    },
  })
  const scoring: ScoringBudget = { remaining: MAX_SCORED_PER_SOURCE, deadline, exhausted: false }
  const ingest = { ...args, scoring, stats }
  const newJobs = await ingestJobItems(
    ingest,
    items.filter((i) => i.normalized.kind === 'job'),
  )
  const newCompanies = await ingestCompanyItems(
    ingest,
    items.filter((i) => i.normalized.kind !== 'job'),
  )
  await sourcesQ.setPolled(args.userId, source.id, undefined, { ...stats })
  logger.info('source_polled', {
    userId: args.userId,
    sourceId: source.id,
    source: source.name,
    kind: source.kind,
    ...stats,
    budgetExhausted: scoring.exhausted,
    durationMs: Date.now() - started,
  })
  return { newJobs, newCompanies, budgetExhausted: scoring.exhausted, stats }
}

/**
 * Ingest items that did not come from an adapter poll (the "Add from text or
 * link" import) into `source` through the same pipeline as a poll: relevance
 * gate, Scam Shield, scoring (same caps) and the source's poll stats.
 * The source does not have to be enabled.
 */
export async function ingestItemsForSource(args: {
  userId: string
  source: Source
  items: DiscoveryItem[]
  ai: AIProvider
  deadline?: number
}): Promise<SourcePollStats> {
  const { userId, source } = args
  const profile = await profileQ.get(userId)
  const relevance = relevanceContext(profile)
  // The Match Score at insert, as a poll does (a pasted post shows "Low confidence: title only" at once).
  const match = matchContext(profile)
  const signal = checkDiscoveryScoringSignal(profile)
  const scoreContext = signal.ok
    ? { cvDigest: profileDigest({ profile, masterCv: await loadMasterCv(userId) }) }
    : undefined
  const scam = await loadScamCtx(userId, NET_LOOKUPS_PER_CYCLE)
  const scoring: ScoringBudget = {
    remaining: MAX_SCORED_PER_SOURCE,
    deadline: args.deadline ?? Number.POSITIVE_INFINITY,
    exhausted: false,
  }
  const stats = emptyPollStats()
  await ingestJobItems(
    { userId, source, ai: args.ai, profile: signal.ok ? profile ?? null : null, scam, scoring, relevance, match, scoreContext, stats },
    args.items.filter((i) => i.normalized.kind === 'job'),
  )
  await sourcesQ.setPolled(userId, source.id, undefined, { ...stats })
  return stats
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

  // A LinkedIn hiring post links to linkedin.com: its employer is the domain
  // of the address in the post, or the name alone (never "linkedin.com").
  const isPost = normalized.subSource === 'linkedin_post'
  const domain = normalized.companyDomain ?? (isPost ? undefined : extractDomain(normalized.applyUrl))
  if (!domain && !isPost) throw new Error('cannot derive company domain from discovery')

  const application = await db.transaction(async (tx) => {
    const company = domain
      ? await companiesQ.findOrCreateByDomain(userId, domain, normalized.companyName, tx)
      : await companiesQ.findOrCreateByName(userId, normalized.companyName, tx)
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
    const app = await appsQ.create(userId, { jobId: job.id, source: isPost ? LINKEDIN_POST_APP_SOURCE : 'discovery' }, tx)
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
