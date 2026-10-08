import * as discoveriesQ from '@/lib/db/queries/discoveries'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import type { UserProfile } from '@/lib/db/queries/profile'
import { reassessStaleDiscoveries, safely } from '@/lib/scam/service'
import { queueRelevanceReevaluation } from '@/lib/discovery/relevance/enqueue'
import { reevaluateRelevance, relevanceStale } from '@/lib/discovery/relevance/service'
import { matchStale, rescoreMatches } from '@/lib/discovery/match/service'
import { queueMatchRescore } from '@/lib/discovery/match/enqueue'
import { parsePageSize } from '@/lib/discovery/pager'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import type {
  DiscoveryRegionFilter,
  DiscoverySort,
  DiscoveryStatusFilter,
} from '@/components/discovery-filters'
import type { DiscoveryBoardColumn, DiscoveryBoardItem } from '@/components/discoveries-board'

/** Parsed, validated Discovery query string. */
export interface DiscoveryParams {
  tab: 'jobs' | 'companies'
  status: DiscoveryStatusFilter
  minScore: number
  sort: DiscoverySort
  page: number
  size: number
  region: DiscoveryRegionFilter
  sourceId: string
  scoredOnly: boolean
  showFiltered: boolean
}

export type RawParams = Record<string, string | undefined>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOB_ONLY_STATUSES: ReadonlySet<string> = new Set(['quarantined', 'shortlisted', 'filtered'])

function parseStatus(raw: string | undefined, tab: 'jobs' | 'companies'): DiscoveryStatusFilter {
  const s = raw as DiscoveryStatusFilter | undefined
  const known = ['new', 'shortlisted', 'saved', 'dismissed', 'filtered', 'quarantined']
  if (!s || !known.includes(s)) return 'new'
  // Quarantine, the shortlist and the relevance filter are job concepts;
  // companies fall back to the inbox.
  return tab === 'companies' && JOB_ONLY_STATUSES.has(s) ? 'new' : s
}

function parseInt10(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

export function parseDiscoveryParams(sp: RawParams, sizeCookie?: string): DiscoveryParams {
  const tab = sp.tab === 'companies' ? 'companies' : 'jobs'
  const sort = sp.sort === 'match' || sp.sort === 'benefits' || sp.sort === 'posted' ? sp.sort : 'combined'
  const region = (['ae', 'gcc', 'in', 'remote'] as const).find((r) => r === sp.region) ?? 'all'
  return {
    tab,
    status: parseStatus(sp.status, tab),
    minScore: parseInt10(sp.minScore, 0, 100, 0),
    sort,
    page: parseInt10(sp.page, 1, 10_000, 1),
    size: parsePageSize(sp.size, sizeCookie),
    region,
    sourceId: sp.source && UUID_RE.test(sp.source) ? sp.source : '',
    scoredOnly: sp.scored === '1',
    showFiltered: sp.filtered === 'show',
  }
}

/** Filters shared by the list, its count and the board. */
function sharedFilters(p: DiscoveryParams): Pick<
  discoveriesQ.ListOpts,
  'region' | 'sourceIds' | 'minScore' | 'scoredOnly'
> {
  return {
    region: p.region === 'all' ? undefined : p.region,
    sourceIds: p.sourceId ? [p.sourceId] : undefined,
    minScore: p.minScore > 0 ? p.minScore : undefined,
    scoredOnly: p.scoredOnly,
  }
}

/** Bound on-view Scam Shield catch-up (rules only, cached net facts). */
const REASSESS_ON_VIEW = 100
/** Bound on-view relevance catch-up; the rest is queued. */
const RELEVANCE_ON_VIEW_MS = 2_500
/** Bound on-view Match Score backfill; the rest is queued. */
const MATCH_ON_VIEW_MS = 2_000

/**
 * Before listing: bring Scam Shield and the relevance gate up to date. The
 * relevance pass is skipped entirely when the profile's applied key matches
 * (the steady state), so a normal view costs no extra query.
 */
export async function catchUp(userId: string, profile: UserProfile | null): Promise<void> {
  await safely('discoveries_view', () => reassessStaleDiscoveries(userId, { limit: REASSESS_ON_VIEW }))
  if (relevanceStale(profile)) {
    const r = await safely('relevance_view', () =>
      reevaluateRelevance(userId, { deadline: Date.now() + RELEVANCE_ON_VIEW_MS, profile }),
    )
    if (r?.remaining) await safely('relevance_queue', () => queueRelevanceReevaluation(userId))
  }
  // Match Scores: rows ingested before the score existed, or under older
  // rules / evidence, are re-scored here (bounded) and by the queued job.
  if (!matchStale(profile)) return
  const m = await safely('match_view', () => rescoreMatches(userId, { deadline: Date.now() + MATCH_ON_VIEW_MS, profile }))
  if (m?.remaining) await safely('match_queue', () => queueMatchRescore(userId))
}

export interface JobsData {
  rows: discoveriesQ.DiscoveryListItem[]
  total: number
  risks: Map<string, riskQ.RiskAssessmentRow>
  quarantinedCount: number
  filteredCount: number
}

export async function loadJobs(userId: string, p: DiscoveryParams): Promise<JobsData> {
  const quarantineView = p.status === 'quarantined'
  const opts: discoveriesQ.ListOpts = {
    ...sharedFilters(p),
    status: quarantineView ? 'all' : (p.status as discoveriesQ.DiscoveryStatus),
    statuses: p.status === 'new' && p.showFiltered ? ['new', 'filtered'] : undefined,
    quarantine: quarantineView ? 'only' : 'exclude',
  }
  const [rows, total, quarantinedCount, filteredCount] = await Promise.all([
    discoveriesQ.list(userId, { ...opts, sort: p.sort, limit: p.size, offset: (p.page - 1) * p.size }),
    discoveriesQ.countList(userId, opts),
    discoveriesQ.countQuarantined(userId),
    discoveriesQ.countList(userId, { ...sharedFilters(p), status: 'filtered', quarantine: 'exclude' }),
  ])
  const risks = await riskQ.mapForTargets(userId, 'discovery', rows.map((d) => d.id))
  return { rows, total, risks, quarantinedCount, filteredCount }
}

/** Cards per board column; the footer links to the full list. */
const BOARD_COLUMN_LIMIT = 25

/**
 * Triage board: each column capped (four lean, indexed queries in parallel)
 * plus one grouped count, all narrowed by the same region / source / score
 * filters as the list. Quarantined rows are excluded, as in the inbox.
 */
export async function loadBoard(
  userId: string,
  p: DiscoveryParams,
): Promise<{
  items: Record<DiscoveryBoardColumn, DiscoveryBoardItem[]>
  totals: Record<DiscoveryBoardColumn, number>
}> {
  const columns: DiscoveryBoardColumn[] = ['new', 'shortlisted', 'saved', 'dismissed']
  const filters = sharedFilters(p)
  const [lists, totals] = await Promise.all([
    Promise.all(
      columns.map((status) =>
        discoveriesQ.list(userId, {
          ...filters,
          status,
          quarantine: 'exclude',
          // Triage columns by fit; outcome columns by recency.
          sort: status === 'new' || status === 'shortlisted' ? 'combined' : 'posted',
          limit: BOARD_COLUMN_LIMIT,
        }),
      ),
    ),
    discoveriesQ.countByStatus(userId, undefined, filters),
  ])
  const items = Object.fromEntries(
    columns.map((status, i) => [
      status,
      lists[i]!.map(
        (d): DiscoveryBoardItem => ({
          id: d.id,
          version: d.updatedAt.toISOString(),
          status,
          title: d.title ?? 'Untitled',
          companyName: d.companyName ?? 'Unknown',
          location: d.location,
          remoteType: d.remoteType,
          matchScore: d.matchScore,
          fitScore: d.fitScore,
          fitDetail: toMatchDetail(d.fitDetail),
          applyUrl: d.applyUrl,
          savedApplicationId: d.savedApplicationId,
        }),
      ),
    ]),
  ) as Record<DiscoveryBoardColumn, DiscoveryBoardItem[]>
  const { new: n, shortlisted, saved, dismissed } = totals
  return { items, totals: { new: n, shortlisted, saved, dismissed } }
}
