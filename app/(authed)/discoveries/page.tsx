import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import * as companyDiscoveriesQ from '@/lib/db/queries/companyDiscoveries'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as riskQ from '@/lib/db/queries/riskAssessments'
import { reassessStaleDiscoveries, safely } from '@/lib/scam/service'
import { toRiskView } from '@/lib/scam/view'
import { PageHeader } from '@/components/page-header'
import { DiscoveryInbox } from '@/components/discovery-inbox'
import {
  DiscoveryFilters,
  type DiscoverySort,
  type DiscoveryStatusFilter,
} from '@/components/discovery-filters'
import type {
  DiscoveryCompanySummary,
  DiscoveryRowJob,
  DiscoveryRowCompany,
  DiscoveryReasoning,
} from '@/components/discovery-row'
import type { NormalizedCompany } from '@/lib/discovery/adapters/types'
import { cn } from '@/lib/utils'
import { BoardViewToggle } from '@/components/board/view-toggle'
import type { DiscoveryBoardColumn, DiscoveryBoardItem } from '@/components/discoveries-board'
import { LazyDiscoveriesBoard } from '@/components/board/lazy'
import { parseBoardView, viewHref, type BoardView } from '@/lib/board/view'

export const dynamic = 'force-dynamic'

interface DiscoveriesPageProps {
  searchParams: Promise<{
    tab?: string
    status?: string
    minScore?: string
    sort?: string
    page?: string
    view?: string
  }>
}

function parseTab(raw: string | undefined): 'jobs' | 'companies' {
  return raw === 'companies' ? 'companies' : 'jobs'
}

function parseStatus(raw: string | undefined): DiscoveryStatusFilter {
  if (raw === 'shortlisted' || raw === 'saved' || raw === 'dismissed' || raw === 'quarantined') return raw
  return 'new'
}

/** Bound on-view Scam Shield catch-up (rules only, cached net facts). */
const REASSESS_ON_VIEW = 100

/** Inbox rows per page (jobs and companies, every status tab). */
const PAGE_SIZE = 50

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? Math.min(n, 10_000) : 1
}

function parseSort(raw: string | undefined): DiscoverySort {
  if (raw === 'match' || raw === 'benefits' || raw === 'posted') return raw
  return 'combined'
}

function parseMinScore(raw: string | undefined): number {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export default async function DiscoveriesPage({
  searchParams,
}: DiscoveriesPageProps): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const sp = await searchParams
  const tab = parseTab(sp.tab)
  const parsedStatus = parseStatus(sp.status)
  // Quarantine and the shortlist are job-discovery concepts; companies fall
  // back to the inbox.
  const status =
    tab === 'companies' && (parsedStatus === 'quarantined' || parsedStatus === 'shortlisted')
      ? 'new'
      : parsedStatus
  const minScore = parseMinScore(sp.minScore)
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const offset = (page - 1) * PAGE_SIZE
  const { view, explicit } = parseBoardView(sp.view, 'list')

  if (tab === 'jobs' && view === 'board') {
    const board = await loadBoard(userId)
    return (
      <div className="space-y-4">
        <PageHeader
          title="Discovery"
          description="Triage AI-scored roles: shortlist, apply or dismiss."
          actions={<ViewToggle sp={sp} view={view} explicit={explicit} />}
        />
        <TabBar tab={tab} />
        <LazyDiscoveriesBoard items={board.items} totals={board.totals} />
      </div>
    )
  }

  // Sources and the tab's rows are independent — fetch them together.
  const [sources, jobs, companies] = await Promise.all([
    sourcesQ.list(userId),
    tab === 'jobs'
      ? loadJobs(userId, { status, minScore, sort, offset })
      : Promise.resolve(null),
    tab === 'companies'
      ? companyDiscoveriesQ.list(userId, {
          status: status === 'quarantined' || status === 'shortlisted' ? 'new' : status,
          minScore: minScore > 0 ? minScore : undefined,
          // One extra row tells us whether a next page exists.
          limit: PAGE_SIZE + 1,
          offset,
        })
      : Promise.resolve([]),
  ])
  const sourceNameById = new Map(sources.map((s) => [s.id, s.name] as const))

  const jobRows = jobs?.rows.slice(0, PAGE_SIZE) ?? []
  const jobItems: DiscoveryRowJob[] = jobRows.map((d) => {
    const sourceName = sourceNameById.get(d.sourceId) ?? 'unknown'
    const risk = jobs?.risks.get(d.id)
    return {
      id: d.id,
      status: d.status,
      matchScore: d.matchScore,
      benefitsScore: d.benefitsScore,
      createdAt: d.createdAt.toISOString(),
      sourceName,
      normalized: {
        title: d.title ?? 'Untitled',
        companyName: d.companyName ?? 'Unknown',
        location: d.location,
        remoteType: d.remoteType,
        techStack: d.techStack,
        applyUrl: d.applyUrl,
      },
      reasoning: (d.matchReasoning as DiscoveryReasoning | null) ?? null,
      scoredByCallId: d.scoredByCallId,
      risk: risk ? toRiskView(risk, sourceName) : null,
    }
  })

  const companyItems: DiscoveryRowCompany[] = companies.slice(0, PAGE_SIZE).map((d) => ({
    id: d.id,
    status: d.status,
    matchScore: d.matchScore,
    createdAt: d.createdAt.toISOString(),
    sourceName: sourceNameById.get(d.sourceId) ?? 'unknown',
    normalized: toCompanySummary(d.normalized),
    reasoning: (d.matchReasoning as DiscoveryReasoning | null) ?? null,
    scoredByCallId: d.scoredByCallId,
  }))

  const hasNext =
    tab === 'jobs' ? (jobs?.rows.length ?? 0) > PAGE_SIZE : companies.length > PAGE_SIZE

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discovery"
        description="AI-scored jobs and companies from your sources."
        actions={tab === 'jobs' ? <ViewToggle sp={sp} view={view} explicit={explicit} /> : undefined}
      />
      <TabBar tab={tab} />
      <DiscoveryFilters
        tab={tab}
        status={status}
        minScore={minScore}
        sort={sort}
        quarantinedCount={jobs?.quarantinedCount ?? 0}
      />
      {tab === 'jobs' ? (
        <DiscoveryInbox kind="jobs" items={jobItems} quarantineView={status === 'quarantined'} />
      ) : (
        <DiscoveryInbox kind="companies" items={companyItems} />
      )}
      <Pager searchParams={sp} page={page} hasNext={hasNext} />
    </div>
  )
}

async function loadJobs(
  userId: string,
  opts: { status: DiscoveryStatusFilter; minScore: number; sort: DiscoverySort; offset: number },
): Promise<{
  rows: discoveriesQ.DiscoveryListItem[]
  risks: Map<string, riskQ.RiskAssessmentRow>
  quarantinedCount: number
}> {
  // v17 §1 — make sure every row has a current Scam Shield assessment
  // (new rules version, rows ingested before Scam Shield) before filtering.
  await safely('discoveries_view', () => reassessStaleDiscoveries(userId, { limit: REASSESS_ON_VIEW }))
  const [rows, quarantinedCount] = await Promise.all([
    discoveriesQ.list(userId, {
      status: opts.status === 'quarantined' ? 'all' : opts.status,
      quarantine: opts.status === 'quarantined' ? 'only' : 'exclude',
      minScore: opts.minScore > 0 ? opts.minScore : undefined,
      sort: opts.sort,
      // One extra row tells us whether a next page exists.
      limit: PAGE_SIZE + 1,
      offset: opts.offset,
    }),
    discoveriesQ.countQuarantined(userId),
  ])
  const risks = await riskQ.mapForTargets(
    userId,
    'discovery',
    rows.slice(0, PAGE_SIZE).map((d) => d.id),
  )
  return { rows, risks, quarantinedCount }
}

/** Cards per board column; the footer links to the full list. */
const BOARD_COLUMN_LIMIT = 25

/**
 * Triage board data: each column capped (four lean, indexed queries in
 * parallel) plus one grouped count. Quarantined rows are excluded, as in
 * the inbox; the same bounded Scam Shield catch-up runs first.
 */
async function loadBoard(userId: string): Promise<{
  items: Record<DiscoveryBoardColumn, DiscoveryBoardItem[]>
  totals: Record<DiscoveryBoardColumn, number>
}> {
  await safely('discoveries_view', () => reassessStaleDiscoveries(userId, { limit: REASSESS_ON_VIEW }))
  const columns: DiscoveryBoardColumn[] = ['new', 'shortlisted', 'saved', 'dismissed']
  const [lists, totals] = await Promise.all([
    Promise.all(
      columns.map((status) =>
        discoveriesQ.list(userId, {
          status,
          quarantine: 'exclude',
          // Triage columns by fit; outcome columns by recency.
          sort: status === 'new' || status === 'shortlisted' ? 'combined' : 'posted',
          limit: BOARD_COLUMN_LIMIT,
        }),
      ),
    ),
    discoveriesQ.countByStatus(userId),
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
          applyUrl: d.applyUrl,
          savedApplicationId: d.savedApplicationId,
        }),
      ),
    ]),
  ) as Record<DiscoveryBoardColumn, DiscoveryBoardItem[]>
  return { items, totals }
}

function ViewToggle({
  sp,
  view,
  explicit,
}: {
  sp: Record<string, string | undefined>
  view: BoardView
  explicit: boolean
}): React.ReactElement {
  return (
    <BoardViewToggle
      page="discoveries"
      current={view}
      defaultView="list"
      explicit={explicit}
      boardHref={viewHref('/discoveries', { tab: 'jobs' }, 'board')}
      listHref={viewHref('/discoveries', sp, 'list')}
    />
  )
}

function toCompanySummary(value: unknown): DiscoveryCompanySummary {
  const n = (value ?? {}) as Partial<NormalizedCompany>
  return {
    name: n.name ?? 'Unknown',
    domain: n.domain ?? null,
    website: n.website ?? null,
    size: n.size ?? null,
    stage: n.stage ?? null,
    techStack: Array.isArray(n.techStack) ? n.techStack : [],
  }
}

interface PagerProps {
  searchParams: Record<string, string | undefined>
  page: number
  hasNext: boolean
}

function Pager({ searchParams, page, hasNext }: PagerProps): React.ReactElement | null {
  if (page === 1 && !hasNext) return null
  const href = (p: number): string => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== 'page') next.set(k, v)
    if (p > 1) next.set('page', String(p))
    const qs = next.toString()
    return qs ? `/discoveries?${qs}` : '/discoveries'
  }
  const linkCls = 'rounded-md border px-3 py-1.5 text-sm hover:bg-muted'
  return (
    <nav aria-label="Discovery pages" className="flex items-center justify-between pt-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkCls}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted-foreground">Page {page}</span>
      {hasNext ? (
        <Link href={href(page + 1)} className={linkCls}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

function TabBar({ tab }: { tab: 'jobs' | 'companies' }): React.ReactElement {
  const tabs: Array<{ id: 'jobs' | 'companies'; label: string }> = [
    { id: 'jobs', label: 'Jobs' },
    { id: 'companies', label: 'Companies' },
  ]
  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={`/discoveries?tab=${t.id}`}
          className={cn(
            'inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-all',
            tab === t.id
              ? 'bg-background text-foreground shadow'
              : 'hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
