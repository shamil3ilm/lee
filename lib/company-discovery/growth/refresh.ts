import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as growthQ from '@/lib/db/queries/companyGrowth'
import { getAdapter } from '@/lib/discovery/adapters'
import { boardSource, type BoardKind } from '@/lib/companies/ats-detect'
import { logger } from '@/lib/logger'
import { createHostLimiter, HOST_INTERVALS_MS } from '@/lib/reputation/rate-limit'
import { companyErrorText, type CompanyHttpDeps } from '../http'
import { refreshFits } from '../service'
import type { CompanyEvidence } from '../types'
import { fetchGithubActivity, fetchHeadcounts, fetchHnTrend, fetchNewsEvents } from './fetch'
import { copyGrowthToPostings } from './postings'
import { companyGrowth, parseSnapshots, withSnapshot } from './score'
import type { NewsEvent, RoleSnapshot } from './signals'
import { underTheRadar } from './visibility'

/**
 * SERVER-ONLY. The weekly growth refresh for one user (a queue job after
 * the discovery run): bounded fact gathering, best-fit companies first,
 * each fact on its own staleness clock —
 *
 *   open-role counts   ROLE_COUNTS_PER_RUN boards, one count a week
 *   GitHub activity    GITHUB_ACTIVITY_PER_RUN orgs, weekly
 *   headcount          one Wikidata query, monthly per company
 *   news + HN trend    NEWS_PER_RUN companies, every 4 weeks
 *   launches, reputation news   database reads, every run
 *
 * then every company's growth score, the fit (growth is a part of it), the
 * "under the radar" flag, and the growth copied onto the user's job
 * postings from those employers.
 */

export const ROLE_COUNTS_PER_RUN = 20
export const GITHUB_ACTIVITY_PER_RUN = 6
export const NEWS_PER_RUN = 4
export const HEADCOUNT_PER_RUN = 40

const DAY = 86_400_000
const WATCHABLE: ReadonlySet<string> = new Set(['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'pinpoint', 'workday', 'teamtailor'])
const GROWTH_NEWS = new Set(['funding', 'acquisition', 'expansion', 'layoffs', 'closure'])

/** GitHub's core API is limited per hour, not per minute (search is not used here). */
export const growthLimiter = createHostLimiter({ intervals: { ...HOST_INTERVALS_MS, 'api.github.com': 1_000, 'query.wikidata.org': 2_000 }, defaultIntervalMs: 1_000 })

export interface GrowthDeps extends CompanyHttpDeps {
  now?: Date
  deadline?: number
  countOpenRoles?: (kind: string, config: Record<string, unknown>, userId: string) => Promise<number | null>
}

export interface GrowthSummary {
  kind: 'company-growth'
  companies: number
  scored: number
  roleCounts: number
  github: number
  news: number
  gems: number
  postings: number
  failed: number
}

async function defaultCount(kind: string, config: Record<string, unknown>, userId: string): Promise<number | null> {
  const adapter = getAdapter(kind)
  if (!adapter) return null
  try {
    return (await adapter.fetch(config, { userId })).length
  } catch {
    return null
  }
}

const olderThan = (iso: string | undefined, days: number, now: Date): boolean => !iso || now.getTime() - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) >= days * DAY

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

interface Work {
  row: companiesQ.CompanyRow
  ev: CompanyEvidence
  snaps: RoleSnapshot[]
  touched: boolean
}

async function gatherFacts(userId: string, work: Work[], deps: GrowthDeps, now: Date, s: GrowthSummary): Promise<void> {
  const timeLeft = (): boolean => deps.deadline === undefined || Date.now() < deps.deadline
  const http: CompanyHttpDeps = { ...deps, limiter: deps.limiter ?? growthLimiter }
  const count = deps.countOpenRoles ?? defaultCount
  const boards = work.filter((w) => w.row.atsKind && WATCHABLE.has(w.row.atsKind) && w.row.atsSlug && olderThan(w.snaps[w.snaps.length - 1]?.d, 6, now))
  for (const w of boards.slice(0, ROLE_COUNTS_PER_RUN)) {
    if (!timeLeft()) break
    const src = boardSource({ kind: w.row.atsKind as BoardKind, slug: w.row.atsSlug!, url: w.row.careersUrl ?? '', watchable: true })
    const n = src ? await count(src.kind, src.config, userId) : null
    if (n === null) continue
    w.snaps = withSnapshot(w.snaps, n, now)
    w.ev = { ...w.ev, openRoles: n }
    w.touched = true
    s.roleCounts += 1
  }
  for (const w of work.filter((x) => x.ev.githubLogin && olderThan(x.ev.github?.at, 7, now)).slice(0, GITHUB_ACTIVITY_PER_RUN)) {
    if (!timeLeft()) break
    try {
      w.ev = { ...w.ev, github: await fetchGithubActivity(w.ev.githubLogin!, http, now) }
      w.touched = true
      s.github += 1
    } catch (e) {
      s.failed += 1
      logger.warn('company_growth_github_failed', { userId, err: companyErrorText(e) })
    }
  }
  const needHeadcount = work.filter((x) => x.ev.wikidataId && olderThan(x.ev.headcountAt, 30, now)).slice(0, HEADCOUNT_PER_RUN)
  if (needHeadcount.length > 0 && timeLeft()) {
    try {
      const counts = await fetchHeadcounts(needHeadcount.map((w) => w.ev.wikidataId!), http)
      for (const w of needHeadcount) {
        const h = counts.get(w.ev.wikidataId!)
        w.ev = { ...w.ev, headcountAt: now.toISOString().slice(0, 10), ...(h && h.length > 0 ? { headcount: h } : {}) }
        w.touched = true
      }
    } catch (e) {
      s.failed += 1
      logger.warn('company_growth_headcount_failed', { userId, err: companyErrorText(e) })
    }
  }
  for (const w of work.filter((x) => olderThan(x.ev.news?.at, 28, now)).slice(0, NEWS_PER_RUN)) {
    if (!timeLeft()) break
    const company = { name: String((w.row.normalized as { name?: unknown }).name ?? ''), domain: w.row.domain }
    if (company.name.length < 3) continue
    try {
      const fresh = await fetchNewsEvents(company, http)
      const keep = [...fresh, ...(w.ev.news?.ev ?? [])].filter((e, i, all) => all.findIndex((x) => x.u === e.u) === i && now.getTime() - Date.parse(`${e.d}T00:00:00Z`) <= 365 * DAY)
      const hn = await fetchHnTrend(company, http, now)
      w.ev = { ...w.ev, news: { at: now.toISOString().slice(0, 10), ev: keep.slice(0, 6) }, hn }
      w.touched = true
      s.news += 1
    } catch (e) {
      s.failed += 1
      logger.warn('company_growth_news_failed', { userId, err: companyErrorText(e) })
    }
  }
}

/** Launches on a company's domain or GitHub org, from the shared What's new rows. */
function launchesFor(w: Work, launches: readonly growthQ.LaunchRow[]): Array<{ d: string; u: string; t: string }> {
  const login = w.ev.githubLogin?.toLowerCase()
  return launches
    .filter((l) => {
      const host = hostOf(l.url)
      if (w.row.domain && host && (host === w.row.domain || host.endsWith(`.${w.row.domain}`))) return true
      return !!login && l.url.toLowerCase().startsWith(`https://github.com/${login}/`)
    })
    .slice(0, 3)
    .map((l) => ({ d: l.at.toISOString().slice(0, 10), u: l.url, t: l.name }))
}

function reputationEvents(rows: readonly growthQ.ReputationNewsRow[]): Map<string, NewsEvent[]> {
  const out = new Map<string, NewsEvent[]>()
  for (const r of rows) {
    const signals = Array.isArray(r.signals) ? (r.signals as Array<{ category?: unknown; date?: unknown; url?: unknown; title?: unknown }>) : []
    const ev = signals.flatMap((x): NewsEvent[] =>
      typeof x.category === 'string' && GROWTH_NEWS.has(x.category) && typeof x.date === 'string' && typeof x.url === 'string'
        ? [{ c: x.category, d: x.date, u: x.url, t: String(x.title ?? '').slice(0, 140) }]
        : [],
    )
    if (ev.length > 0) out.set(r.domain, ev)
  }
  return out
}

export async function refreshGrowth(userId: string, deps: GrowthDeps = {}): Promise<GrowthSummary> {
  const now = deps.now ?? new Date()
  const rows = [...(await companiesQ.inPlay(userId))].sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
  const s: GrowthSummary = { kind: 'company-growth', companies: rows.length, scored: 0, roleCounts: 0, github: 0, news: 0, gems: 0, postings: 0, failed: 0 }
  const work: Work[] = rows.map((row) => ({ row, ev: (row.evidence ?? {}) as CompanyEvidence, snaps: parseSnapshots(row.roleSnapshots), touched: false }))
  await gatherFacts(userId, work, deps, now, s)
  const launches = await growthQ.recentLaunches(new Date(now.getTime() - 90 * DAY)).catch(() => [])
  const repNews = reputationEvents(await growthQ.reputationNewsByDomain(userId, work.flatMap((w) => (w.row.domain ? [w.row.domain] : []))).catch(() => []))
  for (const w of work) {
    const g = companyGrowth(
      { regionIds: w.row.regionIds, industry: w.row.industry, sizeBand: w.row.sizeBand, atsKind: w.row.atsKind, sourceTags: w.row.sourceTags, evidence: w.ev, roleSnapshots: w.snaps },
      now,
      { launches: launchesFor(w, launches), news: w.row.domain ? (repNews.get(w.row.domain) ?? []) : [] },
    )
    if (g.score !== null) s.scored += 1
    const stored = (w.row.growthDetail ?? {}) as { signals?: unknown; radar?: unknown }
    const detail = { ...stored, signals: g.signals }
    const same = w.row.growthScore === g.score && w.row.growthConfidence === g.confidence && JSON.stringify(stored.signals) === JSON.stringify(g.signals)
    if (same && !w.touched) continue
    await companiesQ.patchCompany(userId, w.row.id, {
      growthScore: g.score,
      growthConfidence: g.confidence,
      growthDetail: detail as never,
      growthCheckedAt: now,
      ...(w.touched ? { evidence: w.ev as never, roleSnapshots: w.snaps as never } : {}),
    })
  }
  await refreshFits(userId)
  s.gems = await refreshGems(userId)
  s.postings = await copyGrowthToPostings(userId, now)
  logger.info('company_growth_done', { userId, companies: s.companies, scored: s.scored, roleCounts: s.roleCounts, github: s.github, news: s.news, gems: s.gems })
  return s
}

/** Recompute the "under the radar" flag from the current fit, growth and visibility. */
export async function refreshGems(userId: string): Promise<number> {
  let gems = 0
  for (const row of await companiesQ.inPlay(userId)) {
    const v = underTheRadar({ fitScore: row.fitScore, growthScore: row.growthScore, sourceTags: row.sourceTags, evidence: (row.evidence ?? {}) as CompanyEvidence })
    if (v.gem) gems += 1
    const detail = (row.growthDetail ?? {}) as Record<string, unknown>
    if (row.hiddenGem === v.gem && JSON.stringify(detail.radar ?? []) === JSON.stringify(v.reasons)) continue
    await companiesQ.patchCompany(userId, row.id, { hiddenGem: v.gem, growthDetail: { ...detail, radar: v.reasons } as never })
  }
  return gems
}
