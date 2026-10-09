import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import type { Source } from '@/lib/db/queries/sources'
import { searchPrefsFromProfile, targetFamilies, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { getGitHubUserToken } from '@/lib/integrations/github/token'
import { logger } from '@/lib/logger'
import { withAncestors } from '@/lib/regions/tree'
import { companyFit, type CompanyFit, type FitContext } from './fit'
import { companyErrorText, type CompanyHttpDeps } from './http'
import { dedupeKey, domainOf, normalizeCandidates } from './normalize'
import { fetchWikidataCompanies } from './sources/wikidata'
import { searchOrgs } from './sources/github'
import { fetchYcCompanies } from './sources/yc'
import { fetchQstp, fetchTechnopark, TECHNOPARK_PAGES_PER_RUN } from './sources/directories'
import { githubLocations, targetPlaces, type TargetPlace } from './targets'
import { weeklySlice, wikidataGroups } from './plan'

export { weeklySlice, wikidataGroups } from './plan'
import type { CompanyCandidate, CompanyStage } from './types'
import { connectionsAt, linkedinCandidates, type CompanyCount } from './warm'

/**
 * SERVER-ONLY. The weekly company discovery for one user: Wikidata, GitHub
 * orgs, YC and the user's LinkedIn connections, for the target regions (and
 * the starred ones first). Normalised, deduped by domain / name + country,
 * capped per source per run and per user, and stored as rows of the user's
 * hidden "Local companies" source. Every row gets a deterministic fit; rows
 * with a website are queued for enrichment (careers page, job board).
 */

export const LOCAL_COMPANIES_KIND = 'local_companies'
export const LOCAL_COMPANIES_SOURCE_NAME = 'Local companies'

/** New rows per source per run, and the most rows one user keeps (Neon Free: 0.5 GB). */
export const NEW_PER_SOURCE: Readonly<Record<string, number>> = { wikidata: 60, github: 40, yc: 40, linkedin: 30, paste: 40, directory: 40 }
export const MAX_COMPANIES_PER_USER = 800
/** GitHub location searches per run (6.5 s apart without a token); they rotate weekly. */
export const GITHUB_TERMS_PER_RUN = 6
export const WIKIDATA_GROUPS_PER_RUN = 8

export type CompanySourceId = 'wikidata' | 'github' | 'yc' | 'linkedin' | 'directories'

/** Technopark's listing has 25 pages of 20; a few rotate in each week. */
const TECHNOPARK_PAGES = Array.from({ length: 25 }, (_, i) => i + 1)

export interface SourceRun {
  source: CompanySourceId
  fetched: number
  error?: string
}

export interface CompanyRunSummary {
  kind: 'company-discovery'
  fetched: number
  new: number
  updated: number
  capped: number
  failed: number
  sources: SourceRun[]
}

export async function ensureLocalCompaniesSource(userId: string): Promise<Source> {
  const all = await sourcesQ.list(userId)
  const existing = all.find((s) => s.kind === LOCAL_COMPANIES_KIND)
  if (existing) return existing
  return sourcesQ.create(userId, { name: LOCAL_COMPANIES_SOURCE_NAME, kind: LOCAL_COMPANIES_KIND, config: {}, enabled: false })
}

/** The fit context from the user's search preferences. */
export function fitContextFrom(prefs: SearchPrefs): FitContext {
  return {
    targetRegions: prefs.regionIds,
    preferredRegions: prefs.extra.preferredRegions,
    targetFamilies: targetFamilies(prefs),
    readySkills: prefs.readySkills,
    companyStages: prefs.extra.companyStages as CompanyStage[],
  }
}

export async function loadFitContext(userId: string): Promise<{ ctx: FitContext; prefs: SearchPrefs }> {
  const prefs = searchPrefsFromProfile(await profileQ.get(userId))
  return { ctx: fitContextFrom(prefs), prefs }
}

/**
 * This run's GitHub location searches: the starred countries every week
 * (at most 3), the rest rotating weekly to fill GITHUB_TERMS_PER_RUN.
 */
export function githubTermsForRun(places: readonly TargetPlace[], starred: readonly string[], now: Date): Array<{ term: string; regionId: string }> {
  const terms = githubLocations(places)
  const fixed = terms.filter((t) => starred.includes(t.regionId) && places.find((p) => p.id === t.regionId)?.country).slice(0, 3)
  const rest = terms.filter((t) => !fixed.includes(t))
  return [...fixed, ...weeklySlice(rest, Math.max(0, GITHUB_TERMS_PER_RUN - fixed.length), now)]
}

export interface RunDeps extends CompanyHttpDeps {
  now?: Date
  /** Skip a source (tests, or when its terms change). */
  skip?: readonly CompanySourceId[]
  /** Cooperative deadline (ms epoch). */
  deadline?: number
}

async function githubToken(userId: string): Promise<string | null> {
  try {
    const t = await getGitHubUserToken(userId)
    if (t.ok) return t.token
  } catch {
    // fall through to the deployment token
  }
  return process.env.GITHUB_TOKEN ?? null
}

async function collect(userId: string, prefs: SearchPrefs, deps: RunDeps): Promise<{ candidates: CompanyCandidate[]; runs: SourceRun[]; counts: CompanyCount[] }> {
  const now = deps.now ?? new Date()
  const starred = prefs.extra.preferredRegions.map((r) => r.id)
  const places = targetPlaces(prefs.regionIds, starred)
  const runs: SourceRun[] = []
  const candidates: CompanyCandidate[] = []
  const skip = new Set(deps.skip ?? [])
  const timeLeft = (): boolean => deps.deadline === undefined || Date.now() < deps.deadline
  const run = async (source: CompanySourceId, fn: () => Promise<CompanyCandidate[]>): Promise<void> => {
    if (skip.has(source)) return
    if (!timeLeft()) {
      runs.push({ source, fetched: 0, error: 'out of time' })
      return
    }
    try {
      const got = await fn()
      candidates.push(...got)
      runs.push({ source, fetched: got.length })
    } catch (e) {
      const err = companyErrorText(e)
      runs.push({ source, fetched: 0, error: err })
      logger.warn('company_discovery_source_failed', { userId, source, err })
    }
  }
  await run('wikidata', async () => {
    const out: CompanyCandidate[] = []
    for (const group of wikidataGroups(places).slice(0, WIKIDATA_GROUPS_PER_RUN)) {
      if (!timeLeft()) break
      out.push(...(await fetchWikidataCompanies(group, deps)))
    }
    return out
  })
  const token = deps.githubToken !== undefined ? deps.githubToken : await githubToken(userId)
  await run('github', async () => {
    const out: CompanyCandidate[] = []
    for (const loc of githubTermsForRun(places, starred, now)) {
      if (!timeLeft()) break
      out.push(...(await searchOrgs(loc.term, loc.regionId, { ...deps, githubToken: token })))
    }
    return out
  })
  await run('yc', () => fetchYcCompanies(deps))
  const placeIds = new Set(places.map((p) => p.id))
  await run('directories', async () => {
    const out: CompanyCandidate[] = []
    if (placeIds.has('kerala') || placeIds.has('thiruvananthapuram')) {
      out.push(...(await fetchTechnopark(weeklySlice(TECHNOPARK_PAGES, TECHNOPARK_PAGES_PER_RUN, now), deps)))
    }
    if (placeIds.has('qa') || placeIds.has('doha')) out.push(...(await fetchQstp(deps)))
    return out
  })
  const counts = await linkedinQ.companyCounts(userId).catch(() => [] as CompanyCount[])
  if (!skip.has('linkedin')) {
    const li = linkedinCandidates(counts)
    candidates.push(...li)
    runs.push({ source: 'linkedin', fetched: li.length })
  }
  return { candidates, runs, counts }
}

/** Row fields for a candidate (region ids with ancestors, warm count, compact normalized copy). */
export function toInsert(c: CompanyCandidate, counts: readonly CompanyCount[]): companiesQ.CompanyInsert {
  const connections = connectionsAt(c.name, counts)
  const evidence = { ...c.evidence, ...(connections > 0 ? { connections } : {}) }
  return {
    sourceCompanyId: dedupeKey(c),
    name: c.name,
    website: c.website ?? null,
    domain: domainOf(c.website),
    regionIds: withAncestors(c.regionIds),
    industry: c.industries,
    sizeBand: c.sizeBand ?? null,
    stage: c.stage ?? null,
    sourceTags: c.sourceTags,
    evidence,
    normalized: {
      kind: 'company',
      name: c.name,
      ...(c.website ? { website: c.website, domain: domainOf(c.website) } : {}),
      ...(c.sizeBand ? { size: c.sizeBand } : {}),
      ...(c.stage ? { stage: c.stage } : {}),
      industry: c.industries,
      ...(c.evidence.description ? { description: c.evidence.description } : {}),
    },
  }
}

export function fitOf(row: Pick<companiesQ.CompanyInsert, 'name' | 'regionIds' | 'industry' | 'stage' | 'evidence'> & { atsKind?: string | null; careersUrl?: string | null }, ctx: FitContext): CompanyFit {
  return companyFit(
    {
      name: row.name,
      regionIds: row.regionIds,
      industry: row.industry,
      stage: row.stage,
      atsKind: row.atsKind ?? null,
      careersUrl: row.careersUrl ?? null,
      evidence: row.evidence,
    },
    ctx,
  )
}

/**
 * Store candidates for a user: drops ones already stored under another
 * source (same domain), caps new rows per source and per user (best fit
 * first), upserts, then refreshes every row's fit. Shared by the weekly run
 * and "Add companies from text".
 */
export async function storeCandidates(
  userId: string,
  list: readonly CompanyCandidate[],
  opts: { counts?: readonly CompanyCount[]; ctx?: FitContext } = {},
): Promise<{ new: number; updated: number; capped: number; ids: string[] }> {
  const source = await ensureLocalCompaniesSource(userId)
  const ctx = opts.ctx ?? (await loadFitContext(userId)).ctx
  const counts = opts.counts ?? (await linkedinQ.companyCounts(userId).catch(() => []))
  const merged = [...normalizeCandidates(list).values()].map((c) => toInsert(c, counts))
  const elsewhere = await companiesQ.domainsElsewhere(userId, source.id, merged.flatMap((m) => (m.domain ? [m.domain] : [])))
  const rows = merged.filter((m) => !m.domain || !elsewhere.has(m.domain))
  const known = await companiesQ.existingKeys(source.id, rows.map((r) => r.sourceCompanyId))
  const room = Math.max(0, MAX_COMPANIES_PER_USER - (await companiesQ.countForSource(source.id)))
  const fresh = rows
    .filter((r) => !known.has(r.sourceCompanyId))
    .map((r) => ({ r, fit: fitOf(r, ctx).score }))
    .sort((a, b) => b.fit - a.fit)
  const perSource = new Map<string, number>()
  const kept = new Set<string>()
  for (const { r } of fresh) {
    const tag = (r.sourceTags[0] ?? 'paste').split(':')[0]!
    const used = perSource.get(tag) ?? 0
    if (used >= (NEW_PER_SOURCE[tag] ?? 40) || kept.size >= room) continue
    perSource.set(tag, used + 1)
    kept.add(r.sourceCompanyId)
  }
  const toWrite = rows.filter((r) => known.has(r.sourceCompanyId) || kept.has(r.sourceCompanyId))
  const res = await companiesQ.upsertCompanies(userId, source.id, toWrite)
  await refreshFits(userId, ctx)
  return { new: res.inserted.length, updated: res.updated, capped: fresh.length - kept.size, ids: res.inserted }
}

/** Recompute the fit of every company in play; writes only rows whose score or chips changed. */
export async function refreshFits(userId: string, ctx?: FitContext): Promise<number> {
  const c = ctx ?? (await loadFitContext(userId)).ctx
  let changed = 0
  for (const row of await companiesQ.inPlay(userId)) {
    const name = String((row.normalized as { name?: unknown } | null)?.name ?? '')
    const fit = fitOf(
      { name, regionIds: row.regionIds, industry: row.industry, stage: row.stage, evidence: (row.evidence ?? {}) as never, atsKind: row.atsKind, careersUrl: row.careersUrl },
      c,
    )
    if (row.fitScore === fit.score && JSON.stringify(row.fitDetail) === JSON.stringify(fit.chips)) continue
    await companiesQ.patchCompany(userId, row.id, { fitScore: fit.score, fitDetail: fit.chips as never })
    changed += 1
  }
  return changed
}

/** The weekly run. */
export async function runCompanyDiscovery(userId: string, deps: RunDeps = {}): Promise<CompanyRunSummary> {
  const started = Date.now()
  const { prefs, ctx } = await loadFitContext(userId)
  const { candidates, runs, counts } = await collect(userId, prefs, deps)
  const stored = await storeCandidates(userId, candidates, { counts, ctx })
  const summary: CompanyRunSummary = {
    kind: 'company-discovery',
    fetched: candidates.length,
    new: stored.new,
    updated: stored.updated,
    capped: stored.capped,
    failed: runs.filter((r) => r.error).length,
    sources: runs,
  }
  logger.info('company_discovery_run', { userId, fetched: summary.fetched, new: summary.new, updated: summary.updated, failed: summary.failed, durationMs: Date.now() - started })
  return summary
}
