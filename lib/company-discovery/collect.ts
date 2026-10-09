import * as employersQ from '@/lib/db/queries/companyEmployers'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { logger } from '@/lib/logger'
import { regionMatch } from '@/lib/regions/selection'
import { withAncestors } from '@/lib/regions/tree'
import { walkPages, type ListCursor } from './cursors'
import { companyErrorText, type CompanyHttpDeps } from './http'
import { weeklySlice, wikidataGroups } from './plan'
import { applySeedAliases, seedCandidates } from './seed'
import { searchOrgsPage } from './sources/github'
import { runOsm, runRegisters, selectedPlaces } from './sources/map-register'
import { employersFromPostings, employersFromTracked, JOBS_LOOKBACK_DAYS } from './sources/jobs'
import { DIRECTORY_PAGES_PER_RUN, directoriesFor } from './sources/registry'
import { fetchWikidataCompanies } from './sources/wikidata'
import { fetchYcCompanies } from './sources/yc'
import { DEFAULT_TARGET_SELECTION, githubLocations, targetPlaces, type TargetPlace } from './targets'
import type { CompanyCandidate } from './types'
import { linkedinCandidates, type CompanyCount } from './warm'

/**
 * SERVER-ONLY. Collect one run's candidates for a user. Order follows
 * recall for companies that are NOT famous first: the user's own job
 * postings and watch list, their connections, the complete IT-park and
 * member lists (cursor-walked), GitHub orgs by city (cursor-walked pages),
 * then Wikidata and YC. The seed floor is added offline, and a name-only
 * listing that is a seed company under another name takes its website.
 */

export type CompanySourceId = 'seed' | 'jobs' | 'linkedin' | 'map' | 'register' | 'directories' | 'github' | 'wikidata' | 'yc'

export interface SourceRun {
  source: CompanySourceId
  fetched: number
  error?: string
  /** Pages read this run (paged sources). */
  pages?: number
}

/** GitHub location searches per run (6.5 s apart without a token); terms rotate weekly. */
export const GITHUB_TERMS_PER_RUN = 6
export const WIKIDATA_GROUPS_PER_RUN = 8

export interface CollectDeps extends CompanyHttpDeps {
  now?: Date
  skip?: readonly CompanySourceId[]
  deadline?: number
  /** The user's data.gov.in key (India MCA register); absent = that register is skipped. */
  dataGovInKey?: string | null
}

export interface Collected {
  candidates: CompanyCandidate[]
  runs: SourceRun[]
  counts: CompanyCount[]
  cursors: Record<string, ListCursor>
}

/** This run's GitHub searches: starred countries every week (at most 3), the rest rotating weekly. */
export function githubTermsForRun(places: readonly TargetPlace[], starred: readonly string[], now: Date): Array<{ term: string; regionId: string }> {
  const terms = githubLocations(places)
  const fixed = terms.filter((t) => starred.includes(t.regionId) && places.find((p) => p.id === t.regionId)?.country).slice(0, 3)
  const rest = terms.filter((t) => !fixed.includes(t))
  return [...fixed, ...weeklySlice(rest, Math.max(0, GITHUB_TERMS_PER_RUN - fixed.length), now)]
}

/** Inside the user's target selection (a national list keeps only these). */
export function inTargets(c: CompanyCandidate, selection: readonly string[]): boolean {
  return regionMatch(withAncestors(c.regionIds), selection) === 'in'
}

export async function collectCandidates(userId: string, prefs: SearchPrefs, cursorsIn: Readonly<Record<string, ListCursor>>, deps: CollectDeps): Promise<Collected> {
  const now = deps.now ?? new Date()
  const starred = prefs.extra.preferredRegions.map((r) => r.id)
  const selection = prefs.regionIds.length > 0 ? [...starred, ...prefs.regionIds] : [...starred, ...DEFAULT_TARGET_SELECTION]
  const places = targetPlaces(prefs.regionIds, starred)
  const placeIds = new Set(places.map((p) => p.id))
  const cursors: Record<string, ListCursor> = { ...cursorsIn }
  const runs: SourceRun[] = []
  const candidates: CompanyCandidate[] = []
  const skip = new Set(deps.skip ?? [])
  const timeLeft = (): boolean => deps.deadline === undefined || Date.now() < deps.deadline
  const run = async (source: CompanySourceId, fn: () => Promise<{ items: CompanyCandidate[]; pages?: number; error?: string }>): Promise<void> => {
    if (skip.has(source)) return
    if (!timeLeft()) {
      runs.push({ source, fetched: 0, error: 'out of time' })
      return
    }
    try {
      const got = await fn()
      candidates.push(...got.items)
      runs.push({ source, fetched: got.items.length, ...(got.pages !== undefined ? { pages: got.pages } : {}), ...(got.error ? { error: got.error } : {}) })
    } catch (e) {
      const err = companyErrorText(e)
      runs.push({ source, fetched: 0, error: err })
      logger.warn('company_discovery_source_failed', { userId, source, err })
    }
  }

  await run('seed', async () => ({ items: seedCandidates(selection) }))
  await run('jobs', async () => {
    const since = new Date(now.getTime() - JOBS_LOOKBACK_DAYS * 86_400_000)
    const [postings, tracked] = await Promise.all([employersQ.recentPostingEmployers(userId, since), employersQ.trackedEmployers(userId)])
    return { items: [...employersFromPostings(postings, now), ...employersFromTracked(tracked)] }
  })
  const counts = await linkedinQ.companyCounts(userId).catch(() => [] as CompanyCount[])
  await run('linkedin', async () => ({ items: linkedinCandidates(counts) }))
  // Map and registers: one area each per run (cursors), before the long park walks so they are not starved of time.
  const selected = selectedPlaces(selection)
  const areaDeps = { ...deps, now, timeLeft }
  await run('map', async () => {
    const r = await runOsm(selected, cursors, areaDeps)
    return { items: r.items.filter((c) => inTargets(c, selection)), pages: r.pages, ...(r.error ? { error: r.error } : {}) }
  })
  await run('register', async () => {
    const r = await runRegisters(selected, cursors, areaDeps)
    return { items: r.items.filter((c) => inTargets(c, selection)), pages: r.pages, ...(r.error ? { error: r.error } : {}) }
  })
  await run('directories', async () => {
    const items: CompanyCandidate[] = []
    const errors: string[] = []
    let pages = 0
    for (const dir of directoriesFor(placeIds)) {
      if (!timeLeft()) break
      const key = `dir:${dir.id}`
      const walk = await walkPages(cursors[key], dir.maxPages ?? DIRECTORY_PAGES_PER_RUN, (p) => dir.fetchPage(p, deps), { timeLeft, now, errorText: companyErrorText })
      cursors[key] = walk.cursor
      pages += walk.pagesRead
      items.push(...(dir.targetsOnly ? walk.items.filter((c) => inTargets(c, selection)) : walk.items))
      if (walk.error) errors.push(`${dir.id}: ${walk.error}`)
    }
    return { items, pages, ...(errors.length > 0 ? { error: errors.join('; ').slice(0, 300) } : {}) }
  })
  await run('github', async () => {
    const items: CompanyCandidate[] = []
    let pages = 0
    for (const loc of githubTermsForRun(places, starred, now)) {
      if (!timeLeft()) break
      const key = `gh:${loc.term.toLowerCase()}`
      const walk = await walkPages(cursors[key], 1, (p) => searchOrgsPage(loc.term, loc.regionId, p, deps).then((r) => ({ items: r.companies, lastPage: r.lastPage })), {
        timeLeft,
        now,
        errorText: companyErrorText,
      })
      cursors[key] = walk.cursor
      pages += walk.pagesRead
      items.push(...walk.items)
      // A rate limit or outage on one search stops the rest (the cursor stays put).
      if (walk.error) return { items, pages, error: walk.error }
    }
    return { items, pages }
  })
  await run('wikidata', async () => {
    const items: CompanyCandidate[] = []
    for (const group of wikidataGroups(places).slice(0, WIKIDATA_GROUPS_PER_RUN)) {
      if (!timeLeft()) break
      items.push(...(await fetchWikidataCompanies(group, deps)))
    }
    return { items }
  })
  // YC's list covers every GCC and Indian company: keep the ones in the target places.
  await run('yc', async () => ({ items: (await fetchYcCompanies(deps)).filter((c) => inTargets(c, selection)) }))
  return { candidates: applySeedAliases(candidates), runs, counts, cursors }
}
