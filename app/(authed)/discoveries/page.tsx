import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import { toRiskView } from '@/lib/scam/view'
import { getProfile } from '@/lib/profile/service'
import { PageHeader } from '@/components/page-header'
import { DiscoveryInbox } from '@/components/discovery-inbox'
import { DiscoveryFilters } from '@/components/discovery-filters'
import type {
  DiscoveryRowJob,
  DiscoveryReasoning,
} from '@/components/discovery-row'
import { DiscoveryPager } from '@/components/discovery/pager'
import { ShortlistHeaderLink } from '@/components/apply/shortlist-strip'
import { NoticeArea } from '@/components/discovery/notice-area'
import { PAGE_SIZE_COOKIE } from '@/lib/discovery/pager'
import { loadRoleSuggestions } from '@/lib/discovery/relevance/service'
import { relevanceStale } from '@/lib/discovery/relevance/service'
import { DiscoveryOverflowMenu } from '@/components/discovery/reset-menu'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import { toBestCv } from '@/lib/cv-fit/types'
import { jdTarget } from '@/lib/discovery/match/jd-fetch'
import { cn } from '@/lib/utils'
import { BoardViewToggle } from '@/components/board/view-toggle'
import { LazyDiscoveriesBoard } from '@/components/board/lazy'
import { parseBoardView, viewHref, type BoardView } from '@/lib/board/view'
import { lastCheck } from '@/lib/discovery/poll-stats'
import { relativeFromNow } from '@/lib/ui/date'
import { catchUp, loadBoard, loadJobs, parseDiscoveryParams, type JobsData } from './data'
import { AiModeDialog } from '@/components/discovery/ai-mode-dialog'
import { PasteImportDialog } from '@/components/discovery/paste-import-dialog'
import { loadAiModePrompts, type AiModePromptSet } from '@/lib/discovery/ai-mode/load'
import { discoveryNotices } from './notices'
import { RegionGroups } from '@/components/regions/region-groups'
import { CompaniesTab } from '@/components/companies/companies-tab'
import { parseCompanyParams } from './companies-data'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { toPostRowView } from '@/lib/linkedin-posts/types'

/** "Last checked 2h ago · 12 new" from the sources' last poll results. */
function lastCheckedLine(sources: Parameters<typeof lastCheck>[0]): string | null {
  const c = lastCheck(sources)
  return c ? `Last checked ${relativeFromNow(c.at)} · ${c.newCount} new` : null
}

export const dynamic = 'force-dynamic'
// "Add from text or link" reads ATS job boards and scores within this limit.
export const maxDuration = 60

/** Today's shortlist, AI Mode hand-off and paste import, next to the view toggle. */
function FindMoreActions({
  promptSet,
  shortlist,
  children,
}: {
  promptSet: AiModePromptSet
  shortlist?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <>
      {shortlist}
      <AiModeDialog promptSet={promptSet} />
      <PasteImportDialog />
      {children}
    </>
  )
}

interface DiscoveriesPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function DiscoveriesPage({
  searchParams,
}: DiscoveriesPageProps): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const sp = await searchParams
  const cookieStore = await cookies()
  const p = parseDiscoveryParams(sp, cookieStore.get(PAGE_SIZE_COOKIE)?.value)
  const { view, explicit } = parseBoardView(sp.view, 'list')
  const profile = await getProfile(userId)

  // Read before the catch-up below re-gates the inbox, so a background
  // re-check that is still running can be shown.
  const stale = p.tab === 'jobs' && relevanceStale(profile)
  if (p.tab === 'jobs') await catchUp(userId, profile)
  const [sources, suggestions, promptSet] = await Promise.all([
    sourcesQ.list(userId),
    p.tab === 'jobs' ? loadRoleSuggestions(userId, profile) : Promise.resolve(null),
    loadAiModePrompts(userId, { profile }),
  ])
  const sourceOptions = sources.map((s) => ({ id: s.id, name: s.name }))
  const notices =
    p.tab === 'jobs'
      ? await discoveryNotices({
          userId,
          profile,
          filteredTab: p.status === 'filtered' && view !== 'board',
          stale,
          suggestions: suggestions ? { count: suggestions.suggestions.length, sparse: suggestions.sparse } : null,
          from: '/discoveries',
        })
      : []
  const checked = lastCheckedLine(sources)
  const shortlist = p.tab === 'jobs' ? <ShortlistHeaderLink userId={userId} /> : null

  if (p.tab === 'jobs' && view === 'board') {
    const board = await loadBoard(userId, p)
    return (
      <div className="space-y-4">
        <PageHeader
          title="Discovery"
          description={`Triage scored roles: shortlist, apply or dismiss.${checked ? ` ${checked}.` : ''}`}
          actions={
            <FindMoreActions promptSet={promptSet} shortlist={shortlist}>
              <div className="flex items-center gap-1">
                <ViewToggle sp={sp} view={view} explicit={explicit} />
                <DiscoveryOverflowMenu sources={sourceOptions} />
              </div>
            </FindMoreActions>
          }
          className="mb-0"
        />
        <TabBar tab={p.tab} />
        <NoticeArea notices={notices} />
        <DiscoveryFilters
          tab="jobs"
          status="new"
          hideStatus
          minScore={p.minScore}
          sort={p.sort}
          region={p.region}
          sourceId={p.sourceId}
          sources={sourceOptions}
          scoredOnly={p.scoredOnly}
          hiringPosts={p.hiringPosts}
        />
        <LazyDiscoveriesBoard items={board.items} totals={board.totals} />
      </div>
    )
  }

  if (p.tab === 'companies') {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Discovery"
          description="Local companies and startups worth approaching, even without a posting."
          className="mb-0"
        />
        <TabBar tab={p.tab} />
        <CompaniesTab userId={userId} params={parseCompanyParams(sp, p.size)} prefs={searchPrefsFromProfile(profile)} searchParams={sp} />
      </div>
    )
  }

  const sourceNameById = new Map(sources.map((s) => [s.id, s.name] as const))
  const jobs = await loadJobs(userId, p)
  const total = jobs.total

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discovery"
        description={`Scored jobs and companies from your sources.${checked ? ` ${checked}.` : ''}`}
        className="mb-0"
        actions={
          <FindMoreActions promptSet={promptSet} shortlist={shortlist}>
            <div className="flex items-center gap-1">
              <ViewToggle sp={sp} view={view} explicit={explicit} />
              <DiscoveryOverflowMenu sources={sourceOptions} />
            </div>
          </FindMoreActions>
        }
      />
      <TabBar tab={p.tab} />
      <NoticeArea notices={notices} />
      <DiscoveryFilters
        tab={p.tab}
        status={p.status}
        minScore={p.minScore}
        sort={p.sort}
        quarantinedCount={jobs.quarantinedCount}
        filteredCount={jobs.filteredCount}
        region={p.region}
        sourceId={p.sourceId}
        sources={sourceOptions}
        scoredOnly={p.scoredOnly}
        hiringPosts={p.hiringPosts}
        showFiltered={p.showFiltered}
        resultCount={total}
        byRegion={p.byRegion}
        canGroupByRegion
      />
      {jobs.regionGroups ? <RegionGroups groups={jobs.regionGroups} searchParams={sp} selected={p.region} /> : null}
      <DiscoveryInbox
        kind="jobs"
        items={toJobRows(jobs, sourceNameById)}
        quarantineView={p.status === 'quarantined'}
        filteredView={p.status === 'filtered'}
        pager={<DiscoveryPager searchParams={sp} page={p.page} size={p.size} total={total} position="top" />}
      />
      {total > p.size ? (
        <DiscoveryPager searchParams={sp} page={p.page} size={p.size} total={total} position="bottom" />
      ) : null}
    </div>
  )
}

function toJobRows(jobs: JobsData, sourceNameById: Map<string, string>): DiscoveryRowJob[] {
  return jobs.rows.map((d) => {
    const sourceName = sourceNameById.get(d.sourceId) ?? 'unknown'
    const risk = jobs.risks.get(d.id)
    return {
      id: d.id,
      status: d.status,
      matchScore: d.matchScore,
      benefitsScore: d.benefitsScore,
      fitScore: d.fitScore,
      fitDetail: toMatchDetail(d.fitDetail),
      bestCv: toBestCv(d.bestCv),
      jdFetchable: jdTarget(d.applyUrl) !== null,
      createdAt: d.createdAt.toISOString(),
      sourceName,
      normalized: {
        // Some boards (RemoteOK) serve double-encoded UTF-8; show it repaired.
        title: repairMojibake(d.title ?? 'Untitled'),
        companyName: repairMojibake(d.companyName ?? 'Unknown'),
        location: d.location ? repairMojibake(d.location) : d.location,
        remoteType: d.remoteType,
        techStack: d.techStack,
        applyUrl: d.applyUrl,
      },
      reasoning: (d.matchReasoning as DiscoveryReasoning | null) ?? null,
      scoredByCallId: d.scoredByCallId,
      risk: risk ? toRiskView(risk, sourceName) : null,
      filterReason: d.filterReason,
      notes: d.relevanceNotes,
      post: toPostRowView(d.post),
    }
  })
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
      boardHref={viewHref('/discoveries', { ...sp, tab: 'jobs', status: undefined }, 'board')}
      listHref={viewHref('/discoveries', sp, 'list')}
    />
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
