import { buildGdeltUrl, toNewsSignals } from '@/lib/reputation/sources/gdelt'
import { HN_API, toMentions } from '@/lib/reputation/sources/hn'
import { companyQueryName } from '@/lib/reputation/match'
import { companyGet, companyJson, CompanyHttpError, type CompanyHttpDeps } from '../http'
import { GITHUB_API } from '../sources/github'
import { WDQS_ENDPOINT } from '../sources/wikidata'
import type { GithubActivity, NewsEvent } from './signals'

/**
 * SERVER-ONLY. The weekly growth facts, each through the SSRF-guarded
 * company client (safeFetch) with the per-host spacing:
 *
 *   GitHub     /orgs/{login}/repos (30 most recently pushed) + the weekly
 *              commit counts (/repos/{o}/{r}/stats/participation) of the 3
 *              most active ones: 4 requests an org.
 *   Wikidata   one SPARQL query for every QID: dated employee counts
 *              (P1128 with a P585 point-in-time qualifier).
 *   GDELT      one news query per company (3-month window; kept 12 months).
 *   Hacker News one story search per company (2 years) → mentions per half-year.
 */

const DAY = 86_400_000
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/
const QID = /^Q\d{1,12}$/

function ghHeaders(deps: CompanyHttpDeps): Record<string, string> {
  return { 'x-github-api-version': '2022-11-28', ...(deps.githubToken ? { authorization: `Bearer ${deps.githubToken}` } : {}) }
}

interface Repo {
  name?: unknown
  fork?: unknown
  archived?: unknown
  created_at?: unknown
  pushed_at?: unknown
  stargazers_count?: unknown
}

const time = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN)

/** Repos list → new-repo counts, stars, and the repos worth a commit count (pushed in the last 180 days). */
export function summarizeRepos(body: unknown, now: Date): { nr90: number; nrp90: number; stars: number; active: string[] } {
  const repos = (Array.isArray(body) ? body : []) as Repo[]
  const own = repos.filter((r) => r.fork !== true && r.archived !== true && typeof r.name === 'string' && REPO.test(r.name))
  const t = now.getTime()
  const age = (r: Repo): number => (t - time(r.created_at)) / DAY
  return {
    nr90: own.filter((r) => age(r) <= 90).length,
    nrp90: own.filter((r) => age(r) > 90 && age(r) <= 180).length,
    stars: repos.reduce((s, r) => s + (typeof r.stargazers_count === 'number' ? r.stargazers_count : 0), 0),
    active: own
      .filter((r) => (t - time(r.pushed_at)) / DAY <= 180)
      .sort((a, b) => time(b.pushed_at) - time(a.pushed_at))
      .slice(0, 3)
      .map((r) => r.name as string),
  }
}

/** Participation stats → commits in the last 13 weeks and the 13 before (null while GitHub computes them). */
export function commitWindows(body: unknown): { c90: number; cp90: number } | null {
  const all = (body as { all?: unknown } | null)?.all
  if (!Array.isArray(all) || all.length < 26 || !all.every((n) => typeof n === 'number')) return null
  const weeks = all as number[]
  const sum = (xs: number[]): number => xs.reduce((s, n) => s + n, 0)
  return { c90: sum(weeks.slice(-13)), cp90: sum(weeks.slice(-26, -13)) }
}

export async function fetchGithubActivity(login: string, deps: CompanyHttpDeps, now: Date = new Date()): Promise<GithubActivity> {
  if (!LOGIN.test(login)) throw new Error('github-activity: invalid login')
  const opts = { accept: 'application/vnd.github+json', headers: ghHeaders(deps) }
  const repos = summarizeRepos(await companyJson('github-org-repos', `${GITHUB_API}/orgs/${login}/repos?sort=pushed&per_page=30&type=public`, deps, opts), now)
  let c90 = 0
  let cp90 = 0
  for (const repo of repos.active) {
    const res = await companyGet('github-participation', `${GITHUB_API}/repos/${login}/${repo}/stats/participation`, deps, opts)
    if (res.status !== 200) {
      // 202: GitHub is still computing the stats; the next weekly run gets them.
      void res.body?.cancel().catch(() => undefined)
      continue
    }
    const w = commitWindows(JSON.parse(await res.text()) as unknown)
    if (w) {
      c90 += w.c90
      cp90 += w.cp90
    }
  }
  return { at: now.toISOString().slice(0, 10), c90, cp90, nr90: repos.nr90, nrp90: repos.nrp90, stars: repos.stars }
}

/** SPARQL for dated employee counts of these items (QIDs validated). */
export function headcountQuery(qids: readonly string[]): string {
  const ids = qids.filter((q) => QID.test(q)).map((q) => `wd:${q}`).join(' ')
  return `SELECT ?item ?n ?t WHERE { VALUES ?item { ${ids} } ?item p:P1128 ?st . ?st ps:P1128 ?n . ?st pq:P585 ?t . } LIMIT 500`
}

/** SPARQL JSON → QID → [{ y, n }] oldest first (one count per year, the largest), ≤ 6. */
export function parseHeadcounts(body: unknown): Map<string, Array<{ y: number; n: number }>> {
  const rows = ((body as { results?: { bindings?: unknown } } | null)?.results?.bindings ?? []) as Array<Record<string, { value?: string } | undefined>>
  const out = new Map<string, Map<number, number>>()
  for (const r of Array.isArray(rows) ? rows : []) {
    const qid = (r.item?.value ?? '').split('/').pop() ?? ''
    const n = Number(r.n?.value)
    const y = Number(/^[+-]?(\d{4})/.exec(r.t?.value ?? '')?.[1])
    if (!QID.test(qid) || !Number.isFinite(n) || n <= 0 || !Number.isFinite(y) || y < 1900) continue
    const years = out.get(qid) ?? new Map<number, number>()
    years.set(y, Math.max(years.get(y) ?? 0, Math.round(n)))
    out.set(qid, years)
  }
  return new Map([...out].map(([q, years]) => [q, [...years].sort((a, b) => a[0] - b[0]).slice(-6).map(([y, n]) => ({ y, n }))]))
}

export async function fetchHeadcounts(qids: readonly string[], deps: CompanyHttpDeps): Promise<Map<string, Array<{ y: number; n: number }>>> {
  const valid = qids.filter((q) => QID.test(q)).slice(0, 50)
  if (valid.length === 0) return new Map()
  const url = `${WDQS_ENDPOINT}?format=json&query=${encodeURIComponent(headcountQuery(valid))}`
  return parseHeadcounts(await companyJson('wikidata-headcount', url, { ...deps, timeoutMs: deps.timeoutMs ?? 60_000 }, { accept: 'application/sparql-results+json', maxBytes: 1024 * 1024 }))
}

const GROWTH_NEWS = new Set(['funding', 'acquisition', 'expansion', 'layoffs', 'closure'])

/** GDELT headlines naming the company → growth news events (other categories dropped). */
export async function fetchNewsEvents(company: { name: string; domain: string | null }, deps: CompanyHttpDeps): Promise<NewsEvent[]> {
  // GDELT is slow to answer (often 10–20 s): a longer timeout than the company default.
  const res = await companyGet('gdelt', buildGdeltUrl(company), { ...deps, timeoutMs: deps.timeoutMs ?? 40_000 }, { maxBytes: 2 * 1024 * 1024 })
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined)
    throw new CompanyHttpError('gdelt', res.status)
  }
  const text = (await res.text()).trim()
  // GDELT answers an empty body (or a plain-text notice) when nothing matched.
  let body: unknown = {}
  try {
    body = text ? (JSON.parse(text) as unknown) : {}
  } catch {
    body = {}
  }
  return toNewsSignals(body, company)
    .filter((s) => s.category && GROWTH_NEWS.has(s.category) && s.date)
    .slice(0, 6)
    .map((s) => ({ c: s.category as string, d: s.date as string, u: s.url, t: s.title.slice(0, 140) }))
}

/** Hacker News stories naming the company: mentions in the last 6 months and the 6 before. */
export async function fetchHnTrend(company: { name: string; domain: string | null }, deps: CompanyHttpDeps, now: Date = new Date()): Promise<{ at: string; r: number; p: number }> {
  const since = Math.floor(now.getTime() / 1000) - 365 * 86_400
  const url = `${HN_API}/search?query=${encodeURIComponent(`"${companyQueryName(company.name)}"`)}&tags=story&hitsPerPage=50&numericFilters=created_at_i>${since}`
  const body = (await companyJson('hn', url, deps)) as { hits?: unknown }
  const hits = Array.isArray(body?.hits) ? (body.hits as Parameters<typeof toMentions>[0]) : []
  const mentions = toMentions(hits, company)
  const half = now.getTime() - 182 * DAY
  const r = mentions.filter((m) => m.date && Date.parse(`${m.date}T00:00:00Z`) >= half).length
  return { at: now.toISOString().slice(0, 10), r, p: mentions.length - r }
}
