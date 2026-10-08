import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { canonicalUrl, hostOf, linkOnlyBoard } from './urls'
import { routeLink, type AtsRoute } from './ats-route'
import type { ImportCandidate } from './types'

/**
 * Picked openings → discovery items.
 *
 * A link on a known ATS is read through lee's existing adapter for that ATS
 * (its public job-board endpoint; each board at most once per import) and
 * the matching posting replaces the pasted details. Any other link —
 * LinkedIn, Indeed, Naukri, Bayt, a careers page — is never fetched: the
 * item keeps the pasted title, employer, location, snippet and link.
 */

/** Boards read per import; links beyond this keep their pasted details. */
export const MAX_BOARDS_PER_IMPORT = 8

export interface EnrichDeps {
  getAdapter: (kind: string) => DiscoveryAdapter | null
  ctx?: AdapterContext
}

export interface EnrichedItem {
  item: DiscoveryItem
  /** The ATS that filled in the details, or null (pasted details only). */
  enrichedFrom: string | null
}

function parsedDate(value: string): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000 ? undefined : d
}

function matches(route: AtsRoute, item: DiscoveryItem): boolean {
  const apply = (item.normalized as NormalizedJob).applyUrl ?? ''
  switch (route.kind) {
    case 'greenhouse':
    case 'lever':
    case 'ashby':
      return item.sourceItemId.toLowerCase() === route.jobKey.toLowerCase()
    case 'workable':
      return item.sourceItemId.toUpperCase() === route.jobKey || new RegExp(`/j/${route.jobKey}(/|$)`, 'i').test(apply)
    case 'workday':
      return item.sourceItemId === route.jobKey
  }
}

/** Pasted details only: the item as the user picked it. */
export function pastedItem(c: ImportCandidate): DiscoveryItem {
  const url = canonicalUrl(c.url) ?? c.url
  const board = linkOnlyBoard(url)
  const raw = { via: 'manual_import', title: c.title, employer: c.employer, location: c.location, url, snippet: c.snippet }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: c.title,
    companyName: c.employer || hostOf(url) || 'Unknown',
    location: c.location || undefined,
    applyUrl: url,
    descriptionMd: c.snippet,
    techStack: [],
    postedAt: parsedDate(c.postedDate),
    ...(board ? { subSource: board.toLowerCase() } : {}),
    tags: ['via:manual_import'],
    raw,
  }
  return { sourceItemId: `url:${url}`, raw, normalized }
}

function fromAts(c: ImportCandidate, route: AtsRoute, hit: DiscoveryItem): DiscoveryItem {
  const job = hit.normalized as NormalizedJob
  // Adapters name the company by its board slug; the pasted name reads better.
  const companyName = c.employer || job.companyName
  const normalized: NormalizedJob = {
    ...job,
    companyName,
    tags: [...(job.tags ?? []), 'via:manual_import', `ats:${route.kind}`],
  }
  return { sourceItemId: `${route.boardKey}:${hit.sourceItemId}`, raw: hit.raw, normalized }
}

async function loadBoard(route: AtsRoute, title: string, deps: EnrichDeps): Promise<DiscoveryItem[]> {
  const adapter = deps.getAdapter(route.kind)
  if (!adapter) return []
  // Workday lists thousands of jobs: narrow the read with the site's own search.
  const config = route.kind === 'workday' && title ? { ...route.config, searchText: title.slice(0, 100) } : route.config
  try {
    return await adapter.fetch(config, deps.ctx)
  } catch {
    return []
  }
}

export async function enrichCandidates(candidates: readonly ImportCandidate[], deps: EnrichDeps): Promise<EnrichedItem[]> {
  const boards = new Map<string, Promise<DiscoveryItem[]>>()
  const out: EnrichedItem[] = []
  for (const c of candidates) {
    const r = routeLink(c.url)
    if (r.type !== 'ats') {
      out.push({ item: pastedItem(c), enrichedFrom: null })
      continue
    }
    const key = r.route.kind === 'workday' ? `${r.route.boardKey}?${c.title.toLowerCase()}` : r.route.boardKey
    if (!boards.has(key) && boards.size >= MAX_BOARDS_PER_IMPORT) {
      out.push({ item: pastedItem(c), enrichedFrom: null })
      continue
    }
    if (!boards.has(key)) boards.set(key, loadBoard(r.route, c.title, deps))
    const items = await boards.get(key)!
    const hit = items.find((i) => i.normalized.kind === 'job' && matches(r.route, i))
    out.push(hit ? { item: fromAts(c, r.route, hit), enrichedFrom: r.route.kind } : { item: pastedItem(c), enrichedFrom: null })
  }
  return out
}
