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
import { addWatchedCompany } from '@/lib/companies/service'
import { getAdapter } from './adapters'
import type {
  DiscoveryItem,
  NormalizedCompany,
  NormalizedJob,
} from './adapters/types'
import { applyCaps, benefitsScore } from './scoring'
import { checkDiscoveryScoringSignal } from '@/lib/ai/signal'
import { writeSkipLog } from '@/lib/ai/log'
import type { Source } from '@/lib/db/queries/sources'
import type { Discovery } from '@/lib/db/queries/discoveries'
import type { CompanyDiscovery } from '@/lib/db/queries/companyDiscoveries'
import type { Application } from '@/lib/db/queries/applications'

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
}

const CONCURRENCY = 4
const MAX_ERRORS_BEFORE_SKIP = 5

/**
 * One end-to-end poll of every enabled source for `userId`: for each source,
 * call its adapter, upsert normalized items, and score the ones that are new.
 * Never aborts on a per-source failure — the caller gets an aggregate report.
 */
export async function runDiscoveryCycleForUser(args: {
  userId: string
  ai: AIProvider
}): Promise<DiscoveryCycleResult> {
  const { userId, ai } = args
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

  await inBatches(active, CONCURRENCY, async (source) => {
    try {
      const perSource = await pollSource({ userId, source, ai, profile: scoringProfile })
      result.sourcesPolled += 1
      result.newJobDiscoveries += perSource.newJobs
      result.newCompanyDiscoveries += perSource.newCompanies
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      result.errors.push({ sourceId: source.id, message })
      await sourcesQ.setPolled(userId, source.id, message)
    }
  })

  return result
}

async function pollSource(args: {
  userId: string
  source: Source
  ai: AIProvider
  profile: UserProfile | null
}): Promise<{ newJobs: number; newCompanies: number }> {
  const { userId, source, ai, profile } = args
  const adapter = getAdapter(source.kind)
  if (!adapter) throw new Error(`no adapter registered for kind=${source.kind}`)
  const items = await adapter.fetch(source.config)
  let newJobs = 0
  let newCompanies = 0
  for (const item of items) {
    if (item.normalized.kind === 'job') {
      const fresh = await handleJobItem({ userId, source, ai, profile, item })
      if (fresh) newJobs += 1
    } else {
      const fresh = await handleCompanyItem({ userId, source, ai, profile, item })
      if (fresh) newCompanies += 1
    }
  }
  await sourcesQ.setPolled(userId, source.id)
  return { newJobs, newCompanies }
}

async function handleJobItem(args: {
  userId: string
  source: Source
  ai: AIProvider
  profile: UserProfile | null
  item: DiscoveryItem
}): Promise<boolean> {
  const { userId, source, ai, profile, item } = args
  const normalized = item.normalized as NormalizedJob
  const { discovery, isNew } = await discQ.upsertBySource(
    userId,
    source.id,
    item.sourceItemId,
    item.raw,
    normalized,
  )
  if (!isNew) return false
  if (!profile) return true // no profile → skip scoring, keep discovery
  try {
    // v10.1 — capture the ai_call_logs row id via the `onLogged` callback so
    // we can persist it onto the discovery row for later implicit-signal
    // writeback when the user dismisses or promotes the discovery.
    let capturedCallId: string | null = null
    const scored = await ai.scoreJob(normalized, profile, {
      userId,
      onLogged: (id) => {
        capturedCallId = id
      },
    })
    const finalScore = applyCaps(scored, normalized, profile)
    const bWeights = readBenefitWeights(profile)
    const benefitsRaw =
      (normalized as unknown as { benefits?: Record<string, unknown> }).benefits ?? {}
    const bScore = benefitsScore(benefitsRaw, bWeights)
    await discQ.updateScore(userId, discovery.id, finalScore, bScore, scored)
    if (capturedCallId) {
      await discQ.updateScoredByCallId(userId, discovery.id, capturedCallId)
    }
  } catch {
    // Scoring failure is non-fatal — the discovery row still exists and can
    // be re-scored on the next cycle.
  }
  return true
}

async function handleCompanyItem(args: {
  userId: string
  source: Source
  ai: AIProvider
  profile: UserProfile | null
  item: DiscoveryItem
}): Promise<boolean> {
  const { userId, source, ai, profile, item } = args
  const normalized = item.normalized as NormalizedCompany
  const { discovery, isNew } = await compDiscQ.upsertBySource(
    userId,
    source.id,
    item.sourceItemId,
    item.raw,
    normalized,
  )
  if (!isNew) return false
  if (!profile) return true
  try {
    // v10.1 — see handleJobItem: capture the log row id so implicit signals
    // can flow back on dismiss/save.
    let capturedCallId: string | null = null
    const scored = await ai.scoreCompany(normalized, profile, {
      userId,
      onLogged: (id) => {
        capturedCallId = id
      },
    })
    await compDiscQ.updateScore(userId, discovery.id, Math.round(scored.match_score), scored)
    if (capturedCallId) {
      await compDiscQ.updateScoredByCallId(userId, discovery.id, capturedCallId)
    }
  } catch {
    // Non-fatal.
  }
  return true
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
        postedAt: normalized.postedAt ?? null,
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

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
