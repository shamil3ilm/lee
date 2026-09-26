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
const MAX_ERRORS_BEFORE_SKIP = 5
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
  const profile = await profileQ.get(userId)
  const sources = await sourcesQ.list(userId, { enabled: true })
  const active = sources.filter((s) => s.errorCount < MAX_ERRORS_BEFORE_SKIP)

  const result: DiscoveryCycleResult = {
    sourcesPolled: 0,
    newJobDiscoveries: 0,
    newCompanyDiscoveries: 0,
    errors: [],
  }

  // v10 — signal-check gate. If the user's profile is too thin to produce
  // grounded match scores, we still ingest fresh discoveries but skip the
  // AI scoring pass entirely for this cycle. Surfaced in the response.
  const profileSignal = checkDiscoveryScoringSignal(profile)
  const scoringProfile = profileSignal.ok ? profile : null
  if (!profileSignal.ok) {
    result.signalCheck = {
      skipped: true,
      code: profileSignal.code,
      message: profileSignal.message,
    }
    await writeSkipLog(
      { userId, provider: 'unknown', kind: 'discovery_scoring' },
      profileSignal.code,
    )
  }

  // v17 §1 — Scam Shield: network checks only when the user enabled them;
  // one lookup budget is shared by every source in this cycle.
  // The allow-list is loaded once per cycle, not once per assessed item.
  const scam: ScamCtx = {
    net: (await safely('net_mode', () => netModeForUser(userId))) ?? 'off',
    budget: { remaining: NET_LOOKUPS_PER_CYCLE },
    allowList: (await safely('allow_list', () => allowQ.list(userId))) ?? [],
  }

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
