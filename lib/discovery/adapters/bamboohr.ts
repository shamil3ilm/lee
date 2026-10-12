import { z } from 'zod'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, toDate } from './prefs'
import { htmlToText } from './html-text'
import { DNS_LABEL_RE } from './recruitee'

/**
 * BambooHR public careers site (no key), checked live on 2026-10-12 on
 * aiu.bamboohr.com (41 openings):
 *
 *   GET https://{company}.bamboohr.com/careers/list          (Accept: application/json)
 *       → { result: [{ id, jobOpeningName, departmentLabel, employmentStatusLabel,
 *                      location: { city, state }, atsLocation, isRemote, locationType }] }
 *   GET https://{company}.bamboohr.com/careers/{id}/detail   (Accept: application/json)
 *       → { result: { jobOpening: { description (HTML), datePosted (yyyy-mm-dd),
 *                      minimumExperience, location: { city, state, addressCountry } … } } }
 *
 * robots.txt on *.bamboohr.com disallows only /jobs/embed.php and
 * /jobs/embed2.php. The list carries no description and no date, so new
 * openings get one detail read each: at most DETAIL_MAX per run, one at a
 * time, DETAIL_SPACING_MS apart; ids the source already stored are not
 * re-read (AdapterContext.seenItemIds).
 */

const configSchema = z.object({
  company: z.string().regex(DNS_LABEL_RE),
  /** The employer's name (the list does not carry it). */
  displayName: z.string().min(1).max(120).optional(),
})

export const BAMBOO_DETAIL_MAX = 60
export const BAMBOO_DETAIL_SPACING_MS = 300

interface BambooLocation {
  city?: string | null
  state?: string | null
  province?: string | null
  country?: string | null
  addressCountry?: string | null
  postalCode?: string | null
}

export interface BambooListing {
  id?: string | number
  jobOpeningName?: string
  departmentLabel?: string | null
  employmentStatusLabel?: string | null
  location?: BambooLocation | null
  atsLocation?: BambooLocation | null
  isRemote?: boolean | null
  locationType?: string | number | null
}

export interface BambooDetail extends BambooListing {
  jobOpeningShareUrl?: string
  description?: string | null
  datePosted?: string | null
  minimumExperience?: string | null
  compensation?: string | null
  jobOpeningStatus?: string | null
}

function clean(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
}

/** "Jahrah, Kuwait" from the location block (ATS location first when set). */
export function bambooLocation(l: BambooListing): string | undefined {
  const parts: string[] = []
  for (const loc of [l.atsLocation, l.location]) {
    if (!loc) continue
    for (const v of [loc.city, loc.state ?? loc.province, loc.country ?? loc.addressCountry]) {
      const c = clean(v)
      if (c && !parts.some((p) => p.toLowerCase() === c.toLowerCase())) parts.push(c)
    }
    if (parts.length > 0) break
  }
  return parts.length > 0 ? parts.join(', ') : undefined
}

/** locationType: 0 on-site, 1 remote, 2 hybrid (BambooHR's careers-site values). */
function remoteTypeOf(l: BambooListing): NormalizedJob['remoteType'] {
  if (l.isRemote === true) return 'remote'
  const t = String(l.locationType ?? '')
  if (t === '1') return 'remote'
  if (t === '2') return 'hybrid'
  if (t === '0') return 'onsite'
  return 'unknown'
}

/** "Admin Staff (Local)", "Local Hire", "Full Time - Local": a local hire. */
export function isLocalHire(status: string | null | undefined): boolean {
  return /\blocal(?:ly)?\b/i.test(status ?? '')
}

export function bambooJobUrl(company: string, id: string): string {
  return `https://${company.toLowerCase()}.bamboohr.com/careers/${encodeURIComponent(id)}`
}

export function normalizeBambooListing(l: BambooListing, company: string, companyName: string): DiscoveryItem | null {
  const id = l.id === undefined || l.id === null ? '' : String(l.id)
  const title = clean(l.jobOpeningName)
  if (!id || !title) return null
  const status = clean(l.employmentStatusLabel)
  const department = clean(l.departmentLabel)
  const localHire = isLocalHire(status)
  const raw = {
    id,
    jobOpeningName: title,
    departmentLabel: department || null,
    employmentStatusLabel: status || null,
    location: l.location ?? null,
    locationType: l.locationType ?? null,
  }
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName,
    location: bambooLocation(l),
    remoteType: remoteTypeOf(l),
    employmentType: employmentTypeOf(status),
    descriptionMd: '',
    applyUrl: bambooJobUrl(company, id),
    techStack: [],
    tags: ['ats:bamboohr', ...(localHire ? ['hire:local'] : [])],
    ...(department ? { department } : {}),
    ...(status ? { employmentStatus: status } : {}),
    ...(localHire ? { localHire: true } : {}),
    raw,
  }
  return { sourceItemId: id, raw, normalized }
}

/** The list item with the detail's description, date, experience and full location. */
export function withBambooDetail(item: DiscoveryItem, d: BambooDetail): DiscoveryItem {
  const job = item.normalized as NormalizedJob
  const experience = clean(d.minimumExperience)
  const description = htmlToText(d.description)
  const location = bambooLocation({ atsLocation: d.atsLocation, location: d.location }) ?? job.location
  return {
    ...item,
    normalized: {
      ...job,
      ...(description ? { descriptionMd: description } : {}),
      ...(location ? { location } : {}),
      postedAt: toDate(d.datePosted) ?? job.postedAt,
      tags: [...(job.tags ?? []), ...(experience ? [`experience:${experience.toLowerCase()}`] : [])],
    },
  }
}

export interface BambooDeps {
  /** Wait between detail reads (tests pass 0). */
  spacingMs?: number
  detailMax?: number
}

async function readJson(url: string): Promise<unknown> {
  const res = await discoveryFetch('bamboohr', url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`bamboohr ${res.status}`)
  return res.json()
}

export async function fetchBambooList(company: string): Promise<BambooListing[]> {
  const body = (await readJson(`https://${company.toLowerCase()}.bamboohr.com/careers/list`)) as { result?: unknown }
  if (!Array.isArray(body.result)) throw new Error('bamboohr: unexpected response (no result list)')
  return body.result as BambooListing[]
}

export async function fetchBambooDetail(company: string, id: string): Promise<BambooDetail | null> {
  const body = (await readJson(`https://${company.toLowerCase()}.bamboohr.com/careers/${encodeURIComponent(id)}/detail`)) as {
    result?: { jobOpening?: BambooDetail }
  }
  return body.result?.jobOpening ?? null
}

/**
 * One opening by id (a job link found elsewhere, e.g. a news roundup): the
 * detail endpoint alone; null when the opening is gone or closed.
 */
export async function fetchBambooJob(company: string, id: string, companyName: string): Promise<DiscoveryItem | null> {
  const slug = configSchema.shape.company.parse(company)
  const d = await fetchBambooDetail(slug, id).catch(() => null)
  if (!d || (d.jobOpeningStatus && !/open/i.test(d.jobOpeningStatus))) return null
  const base = normalizeBambooListing({ ...d, id }, slug, companyName)
  return base ? withBambooDetail(base, d) : null
}

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms))

export class BambooHrAdapter implements DiscoveryAdapter {
  readonly kind = 'bamboohr'

  constructor(private readonly deps: BambooDeps = {}) {}

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const { company, displayName } = configSchema.parse(config)
    const slug = company.toLowerCase()
    const companyName = displayName ?? slug
    const items = (await fetchBambooList(slug))
      .map((l) => normalizeBambooListing(l, slug, companyName))
      .filter((x): x is DiscoveryItem => x !== null)
    const seen = ctx?.seenItemIds ? await ctx.seenItemIds(items.map((i) => i.sourceItemId)).catch(() => new Set<string>()) : new Set<string>()
    // Newest ids first (BambooHR ids grow): the detail budget goes to them.
    const fresh = items.filter((i) => !seen.has(i.sourceItemId)).sort((a, b) => Number(b.sourceItemId) - Number(a.sourceItemId))
    const max = this.deps.detailMax ?? BAMBOO_DETAIL_MAX
    const spacing = this.deps.spacingMs ?? BAMBOO_DETAIL_SPACING_MS
    const enriched = new Map<string, DiscoveryItem>()
    for (const [n, item] of fresh.slice(0, max).entries()) {
      if (n > 0 && spacing > 0) await sleep(spacing)
      try {
        const d = await fetchBambooDetail(slug, item.sourceItemId)
        if (d) enriched.set(item.sourceItemId, withBambooDetail(item, d))
      } catch {
        // Keep the list data; the next run retries while the row is unseen.
      }
    }
    // Unseen openings over the detail budget wait for the next run, so
    // every stored row carries its description.
    const waiting = new Set(fresh.slice(max).map((i) => i.sourceItemId))
    return items.filter((i) => !waiting.has(i.sourceItemId)).map((i) => enriched.get(i.sourceItemId) ?? i)
  }
}
