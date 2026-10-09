import * as profileQ from '@/lib/db/queries/profile'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import type { Source } from '@/lib/db/queries/sources'
import { searchPrefsFromProfile, targetFamilies, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { getGitHubUserToken } from '@/lib/integrations/github/token'
import { resolveServiceSecret } from '@/lib/settings/secrets'
import { logger } from '@/lib/logger'
import { withAncestors } from '@/lib/regions/tree'
import { collectCandidates, type CompanySourceId, type SourceRun } from './collect'
import { parseCursors } from './cursors'
import { companyFit, type CompanyFit, type FitContext } from './fit'
import { foldDuplicates, remapToKnown } from './fold'
import type { CompanyHttpDeps } from './http'
import { dedupeKey, domainOf, normalizeCandidates } from './normalize'
import type { CompanyCandidate, CompanyStage } from './types'
import { connectionsAt, type CompanyCount } from './warm'

export { weeklySlice, wikidataGroups } from './plan'
export { githubTermsForRun, GITHUB_TERMS_PER_RUN, type CompanySourceId, type SourceRun } from './collect'

/**
 * SERVER-ONLY. The weekly company discovery for one user (./collect.ts
 * gathers the candidates: job postings, connections, complete park and
 * member lists, GitHub orgs by city, Wikidata, YC and the seed floor).
 * Normalised, deduped by domain / name + country, capped per source per run
 * and per user, and stored as rows of the user's hidden "Local companies"
 * source. Every row gets a deterministic fit; rows with a website (or a
 * park profile page) are queued for enrichment.
 */

export const LOCAL_COMPANIES_KIND = 'local_companies'
export const LOCAL_COMPANIES_SOURCE_NAME = 'Local companies'

/**
 * New rows per source per run, and the most rows one user keeps. A complete
 * park list is hundreds of companies (Technopark 497, Infopark 401), so the
 * directory cap fits all of them in one run; the per-user cap (about 2 KB a
 * row, about 6 MB at the cap) keeps Neon Free (0.5 GB) safe.
 */
export const NEW_PER_SOURCE: Readonly<Record<string, number>> = {
  directory: 1200,
  github: 150,
  wikidata: 150,
  jobs: 300,
  seed: 200,
  linkedin: 60,
  yc: 40,
  paste: 40,
  search: 5,
  // OpenStreetMap and the registers (GLEIF, India MCA): ranked by hiring likelihood before the cap.
  map: 150,
  register: 150,
}
export const MAX_COMPANIES_PER_USER = 3000

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

export interface RunDeps extends CompanyHttpDeps {
  now?: Date
  /** Skip a source (tests, or when its terms change). */
  skip?: readonly CompanySourceId[]
  /** Cooperative deadline (ms epoch). */
  deadline?: number
  /** The data.gov.in key for the India MCA register (tests pass null; default: the user's saved key). */
  dataGovInKey?: string | null
}

/** The user's own data.gov.in key (Settings › AI); null when none is saved. */
async function dataGovKey(userId: string): Promise<string | null> {
  try {
    const { key, source } = await resolveServiceSecret(userId, 'data_gov_in')
    return source === 'none' ? null : key
  } catch {
    return null
  }
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
    ...(c.board ? { board: c.board } : {}),
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

export function fitOf(
  row: Pick<companiesQ.CompanyInsert, 'name' | 'regionIds' | 'industry' | 'stage' | 'evidence'> & {
    atsKind?: string | null
    careersUrl?: string | null
    growthScore?: number | null
    growthConfidence?: string | null
  },
  ctx: FitContext,
): CompanyFit {
  return companyFit(
    {
      name: row.name,
      regionIds: row.regionIds,
      industry: row.industry,
      stage: row.stage,
      atsKind: row.atsKind ?? null,
      careersUrl: row.careersUrl ?? null,
      evidence: row.evidence,
      growth: { score: row.growthScore ?? null, confidence: row.growthConfidence ?? null },
    },
    ctx,
  )
}

/** One insert per key (two listings remapped onto the same stored company merge their tags and places). */
function uniqueByKey(rows: readonly companiesQ.CompanyInsert[]): companiesQ.CompanyInsert[] {
  const out = new Map<string, companiesQ.CompanyInsert>()
  for (const r of rows) {
    const prev = out.get(r.sourceCompanyId)
    out.set(
      r.sourceCompanyId,
      prev
        ? { ...prev, sourceTags: [...new Set([...prev.sourceTags, ...r.sourceTags])], regionIds: [...new Set([...prev.regionIds, ...r.regionIds])], evidence: { ...r.evidence, ...prev.evidence } }
        : r,
    )
  }
  return [...out.values()]
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
  const rows = uniqueByKey(
    remapToKnown(
      merged.filter((m) => !m.domain || !elsewhere.has(m.domain)),
      await companiesQ.foldIndex(source.id),
    ),
  )
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
  await foldDuplicates(userId, source.id)
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
      { name, regionIds: row.regionIds, industry: row.industry, stage: row.stage, evidence: (row.evidence ?? {}) as never, atsKind: row.atsKind, careersUrl: row.careersUrl, growthScore: row.growthScore, growthConfidence: row.growthConfidence },
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
  const source = await ensureLocalCompaniesSource(userId)
  const token = deps.githubToken !== undefined ? deps.githubToken : await githubToken(userId)
  const dataGovInKey = deps.dataGovInKey !== undefined ? deps.dataGovInKey : await dataGovKey(userId)
  const { candidates, runs, counts, cursors } = await collectCandidates(userId, prefs, parseCursors(source.config), { ...deps, githubToken: token, dataGovInKey })
  await sourcesQ.update(userId, source.id, { config: { ...((source.config ?? {}) as Record<string, unknown>), cursors }, lastPolledAt: deps.now ?? new Date() })
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
