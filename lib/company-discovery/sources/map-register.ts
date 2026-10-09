import { expandSelection } from '@/lib/regions/selection'
import { walkPages, type ListCursor } from '../cursors'
import { companyErrorText, companyJson, type CompanyHttpDeps } from '../http'
import { hireLikelihood } from '../hire-likelihood'
import type { CompanyCandidate } from '../types'
import { fetchGleifPage, GLEIF_PAGES_PER_RUN, gleifUrl, parseGleifPage } from './gleif'
import { fetchMcaPage, MCA_PAGES_PER_RUN } from './mca'
import { fetchOsmArea } from './overpass'
import { areasFor, GLEIF_AREAS, MCA_STATES, OSM_AREAS, type GleifArea, type OsmArea } from './register-areas'

/**
 * SERVER-ONLY. The map and register sources in a weekly run, each walking
 * ONE area per run with a cursor per area (`osm:<area>`, `gleif:<area>`,
 * `mca:<state>`), so a full pass over a user's areas takes weeks, never
 * minutes:
 *
 *   OpenStreetMap  one Overpass query, and at most one every OSM_MIN_DAYS
 *   GLEIF          up to GLEIF_PAGES_PER_RUN pages of one area
 *   India MCA      up to MCA_PAGES_PER_RUN pages of one state, only with the
 *                  user's data.gov.in key
 *
 * Listings are kept whatever their industry (obvious non-employers were
 * dropped by the parsers), ranked by the hiring likelihood, and capped per
 * run. They add no fit or growth points by themselves.
 */

export const OSM_MIN_DAYS = 14
/** A finished area is read again after this many days. */
export const AREA_REVISIT_DAYS = 90
/** New listings kept per run per source family, most likely employers first. */
export const MAP_PER_RUN = 150
export const REGISTER_PER_RUN = 150

const OSM_LAST = 'osm:_last'

export interface AreaRunDeps extends CompanyHttpDeps {
  now?: Date
  timeLeft?: () => boolean
  /** The user's data.gov.in key (India MCA); absent = MCA skipped. */
  dataGovInKey?: string | null
}

export interface AreaRun {
  items: CompanyCandidate[]
  pages: number
  error?: string
  /** The areas read this run. */
  areas: string[]
}

const DAY = 86_400_000

/**
 * The area to read next: one part-way through its pages, then one never
 * read, then the one finished longest ago (if at least `revisitDays` ago).
 */
export function pickArea<T extends { id: string }>(areas: readonly T[], cursors: Readonly<Record<string, ListCursor>>, prefix: string, now: Date, revisitDays = AREA_REVISIT_DAYS): T | null {
  const cur = (a: T): ListCursor | undefined => cursors[`${prefix}:${a.id}`]
  const midway = areas.find((a) => (cur(a)?.next ?? 1) > 1)
  if (midway) return midway
  const fresh = areas.find((a) => !cur(a))
  if (fresh) return fresh
  const done = areas
    .map((a) => ({ a, at: Date.parse(cur(a)?.completedAt ?? '') }))
    .filter((x) => Number.isFinite(x.at) && now.getTime() - x.at >= revisitDays * DAY)
    .sort((x, y) => x.at - y.at)
  return done[0]?.a ?? null
}

/** Most likely employers first, at most `cap`. */
export function rankByLikelihood(items: readonly CompanyCandidate[], cap: number): CompanyCandidate[] {
  return items
    .map((c) => ({ c, s: hireLikelihood({ sector: c.evidence.sector, industries: c.industries, evidence: c.evidence, website: c.website }).score }))
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, Math.max(0, cap))
    .map((x) => x.c)
}

/** Region ids a selection covers (the area tables name cities and countries). */
export function selectedPlaces(selection: readonly string[]): Set<string> {
  return new Set(expandSelection(selection))
}

/** OpenStreetMap: one area, at most one query every OSM_MIN_DAYS days per user. */
export async function runOsm(places: ReadonlySet<string>, cursors: Record<string, ListCursor>, deps: AreaRunDeps): Promise<AreaRun> {
  const now = deps.now ?? new Date()
  const last = Date.parse(cursors[OSM_LAST]?.completedAt ?? '')
  if (Number.isFinite(last) && now.getTime() - last < OSM_MIN_DAYS * DAY) return { items: [], pages: 0, areas: [] }
  const area = pickArea(areasFor(OSM_AREAS, places), cursors, 'osm', now)
  if (!area) return { items: [], pages: 0, areas: [] }
  const walk = await walkPages(cursors[`osm:${area.id}`], 1, async () => ({ items: await fetchOsmArea(area, deps), lastPage: 1 }), {
    ...(deps.timeLeft ? { timeLeft: deps.timeLeft } : {}),
    now,
    errorText: companyErrorText,
  })
  cursors[`osm:${area.id}`] = walk.cursor
  // A failed query also waits out the interval: the public instance is not retried within the fortnight.
  if (walk.pagesRead > 0 || walk.error) cursors[OSM_LAST] = { next: 1, completedAt: now.toISOString() }
  return { items: rankByLikelihood(walk.items, MAP_PER_RUN), pages: walk.pagesRead, areas: [area.id], ...(walk.error ? { error: `${area.id}: ${walk.error}` } : {}) }
}

/** GLEIF and (with a key) India MCA: one area each, a few pages. */
export async function runRegisters(places: ReadonlySet<string>, cursors: Record<string, ListCursor>, deps: AreaRunDeps): Promise<AreaRun> {
  const now = deps.now ?? new Date()
  const opts = { ...(deps.timeLeft ? { timeLeft: deps.timeLeft } : {}), now, errorText: companyErrorText }
  const items: CompanyCandidate[] = []
  const errors: string[] = []
  const areas: string[] = []
  let pages = 0
  const gleif = pickArea(areasFor(GLEIF_AREAS, places), cursors, 'gleif', now)
  if (gleif) {
    const walk = await walkPages(cursors[`gleif:${gleif.id}`], GLEIF_PAGES_PER_RUN, (p) => fetchGleifPage(gleif, p, deps), opts)
    cursors[`gleif:${gleif.id}`] = walk.cursor
    pages += walk.pagesRead
    items.push(...walk.items)
    areas.push(`gleif:${gleif.id}`)
    if (walk.error) errors.push(`gleif ${gleif.id}: ${walk.error}`)
  }
  const key = deps.dataGovInKey?.trim()
  const mca = key ? pickArea(areasFor(MCA_STATES, places), cursors, 'mca', now) : null
  if (mca && key) {
    const walk = await walkPages(cursors[`mca:${mca.id}`], MCA_PAGES_PER_RUN, (p) => fetchMcaPage(mca, p, key, deps), opts)
    cursors[`mca:${mca.id}`] = walk.cursor
    pages += walk.pagesRead
    items.push(...walk.items)
    areas.push(`mca:${mca.id}`)
    if (walk.error) errors.push(`mca ${mca.id}: ${walk.error}`)
  }
  return { items: rankByLikelihood(items, REGISTER_PER_RUN), pages, areas, ...(errors.length > 0 ? { error: errors.join('; ').slice(0, 300) } : {}) }
}

export interface RegionCount {
  region: string
  osm: Array<{ area: string; candidates: number; withWebsite: number; likely: number; sample: string[] }>
  gleif: Array<{ area: string; total: number; firstPageKept: number; sample: string[] }>
}

/**
 * Candidate counts for one region WITHOUT the database (a pure fetch and
 * parse, for live checks): the first `maxOsmAreas` OpenStreetMap areas and
 * the first page of the first GLEIF area the region switches on, with the
 * GLEIF total. A handful of requests.
 */
export async function countRegionCandidates(region: string, deps: CompanyHttpDeps = {}, opts: { maxOsmAreas?: number; gleifPageSize?: number } = {}): Promise<RegionCount> {
  const places = selectedPlaces([region])
  const out: RegionCount = { region, osm: [], gleif: [] }
  const osmAreas: OsmArea[] = areasFor(OSM_AREAS, places).slice(0, opts.maxOsmAreas ?? 1)
  for (const area of osmAreas) {
    const items = await fetchOsmArea(area, deps)
    const likely = items.filter((c) => hireLikelihood({ sector: c.evidence.sector, industries: c.industries, evidence: c.evidence }).band !== 'low').length
    out.osm.push({ area: area.id, candidates: items.length, withWebsite: items.filter((c) => c.website).length, likely, sample: rankByLikelihood(items, 5).map((c) => c.name) })
  }
  const gleif: GleifArea | undefined = areasFor(GLEIF_AREAS, places)[0]
  if (gleif) {
    const body = await companyJson('gleif', gleifUrl(gleif, 1, opts.gleifPageSize ?? 100), { ...deps, timeoutMs: deps.timeoutMs ?? 30_000 }, { accept: 'application/vnd.api+json', maxBytes: 8 * 1024 * 1024 })
    const total = Number((body as { meta?: { pagination?: { total?: unknown } } }).meta?.pagination?.total ?? 0)
    const page = parseGleifPage(body, gleif)
    out.gleif.push({ area: gleif.id, total, firstPageKept: page.items.length, sample: rankByLikelihood(page.items, 5).map((c) => c.name) })
  }
  return out
}
