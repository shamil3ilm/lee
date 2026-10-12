import { Suspense } from 'react'
import { CompaniesHeaderActions } from '@/components/companies/companies-header-actions'
import { CompaniesSkeleton } from '@/components/companies/companies-skeleton'
import { companyPrompts } from '@/lib/company-discovery/ai-prompts'
import { LOCAL_COMPANIES_KIND } from '@/lib/company-discovery/service'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import { toRiskView } from '@/lib/scam/view'
import { getProfile } from '@/lib/profile/service'
import type { UserProfile } from '@/lib/db/queries/profile'
import { PageHeader } from '@/components/page-header'
import { CoverageLine } from '@/components/coverage/coverage-line'
import { starredCoverage } from '@/lib/coverage/service'
import { toRowViews } from '@/lib/coverage/view'
import { DiscoveryInbox } from '@/components/discovery-inbox'
import { DiscoveryFilters } from '@/components/discovery-filters'
import type {
  DiscoveryRowJob,
  DiscoveryReasoning,
} from '@/components/discovery-row'
import { DiscoveryPager } from '@/components/discovery/pager'
import { shortlistOpenCount } from '@/components/apply/shortlist-strip'
import { NoticeArea } from '@/components/discovery/notice-area'
import { DiscoveryCounts } from '@/components/discovery/discovery-counts'
import { DiscoveryMenu } from '@/components/discovery/discovery-menu'
import { PAGE_SIZE_COOKIE } from '@/lib/discovery/pager'
import { loadRoleSuggestions } from '@/lib/discovery/relevance/service'
import { relevanceStale } from '@/lib/discovery/relevance/service'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import { toBestCv } from '@/lib/cv-fit/types'
import { jdTarget } from '@/lib/discovery/match/jd-fetch'
import { countNeedsLook } from '@/lib/discovery/needs-look-count'
import { isNeedsLook } from '@/lib/ui/needs-look'
import { cn } from '@/lib/utils'
import { BoardViewToggle } from '@/components/board/view-toggle'
import { LazyDiscoveriesBoard } from '@/components/board/lazy'
import { parseBoardView, viewHref, type BoardView } from '@/lib/board/view'
import { lastCheck } from '@/lib/discovery/poll-stats'
import { relativeFromNow } from '@/lib/ui/date'
import { catchUp, loadBoard, loadJobs, parseDiscoveryParams, type JobsData } from './data'
import { loadScreens } from '@/lib/screening/load'
import { screenIds, withBoardScreens, withScreens } from '@/lib/screening/attach'
import { PasteImportDialog } from '@/components/discovery/paste-import-dialog'
import { loadAiModePrompts } from '@/lib/discovery/ai-mode/load'
import { discoveryNotices } from './notices'
import { RegionGroups } from '@/components/regions/region-groups'
import { CompaniesTab } from '@/components/companies/companies-tab'
import { parseCompanyParams } from './companies-data'
import { searchPrefsFromProfile, targetFamilies } from '@/lib/discovery/relevance/prefs'
import { toPostRowView } from '@/lib/linkedin-posts/types'

export const dynamic = 'force-dynamic'
// "Add from text or link" reads ATS job boards and scores within this limit.
export const maxDuration = 60

interface DiscoveriesPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

/**
 * Discovery. The header stack is kept short so the first card sits high
 * (review 2026-10-10 P0-8): the title with outcome counts, "Add from text
 * or link" plus a "⋯" menu, then ONE toolbar row (Jobs | Companies, the
 * filters, Board | List), then one compact context line (what you're
 * looking for; starred-region coverage on the job list only).
 */
export default async function DiscoveriesPage({
  searchParams,
}: DiscoveriesPageProps): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const sp = await searchParams
  const cookieStore = await cookies()
  const p = parseDiscoveryParams(sp, cookieStore.get(PAGE_SIZE_COOKIE)?.value)
  const { view, explicit } = parseBoardView(sp.view, 'list')
  const profile = await getProfile(userId)

  if (p.tab === 'companies') return <CompaniesView userId={userId} profile={profile} sp={sp} size={p.size} />

  // Read before the catch-up below re-gates the inbox, so a background
  // re-check that is still running can be shown.
  const stale = relevanceStale(profile)
  await catchUp(userId, profile)
  const [sources, suggestions, promptSet, statusCounts, needsLook, shortlistCount] = await Promise.all([
    sourcesQ.list(userId),
    loadRoleSuggestions(userId, profile),
    loadAiModePrompts(userId, { profile }),
    discoveriesQ.countByStatus(userId),
    countNeedsLook(userId),
    shortlistOpenCount(userId),
  ])
  const sourceOptions = sources.map((s) => ({ id: s.id, name: s.name }))
  const notices = await discoveryNotices({
    userId,
    profile,
    filteredTab: p.status === 'filtered' && view !== 'board',
    stale,
    suggestions: suggestions ? { count: suggestions.suggestions.length, sparse: suggestions.sparse } : null,
    from: '/discoveries',
  })
  const last = lastCheck(sources)
  const growthInFit = searchPrefsFromProfile(profile).extra.growthInFit
  const header = (
    <PageHeader
      title="Discovery"
      description={
        <DiscoveryCounts
          checked={last ? relativeFromNow(last.at) : null}
          fetched={last ? last.newCount : null}
          toTriage={statusCounts.new}
          needsLook={needsLook}
          filtered={statusCounts.filtered}
        />
      }
      className="mb-0"
      inlineActions
      actions={
        <>
          <PasteImportDialog compact />
          <DiscoveryMenu sources={sourceOptions} promptSet={promptSet} shortlistCount={shortlistCount} />
        </>
      }
    />
  )
  const toggle = <ViewToggle sp={sp} view={view} explicit={explicit} />

  if (view === 'board') {
    const board = await loadBoard(userId, p, growthInFit)
    // Screening path (lib/screening): chips on in-play cards, computed on read.
    const boardScreens = await loadScreens(userId, profile, screenIds(Object.values(board.items).flat()))
    return (
      <div className="space-y-3">
        {header}
        <Toolbar tab="jobs" toggle={toggle}>
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
        </Toolbar>
        <NoticeArea notices={notices} />
        <LazyDiscoveriesBoard items={withBoardScreens(board.items, boardScreens)} totals={board.totals} />
      </div>
    )
  }

  const sourceNameById = new Map(sources.map((s) => [s.id, s.name] as const))
  const [jobs, coverage] = await Promise.all([loadJobs(userId, p, growthInFit), starredCoverage(userId)])
  const total = jobs.total
  // Screening path (lib/screening): chip + "Why this score" block, computed on read.
  const screens = await loadScreens(userId, profile, screenIds(jobs.rows))

  return (
    <div className="space-y-3">
      {header}
      <Toolbar tab="jobs" toggle={toggle}>
        <DiscoveryFilters
          tab={p.tab}
          status={p.status}
          minScore={p.minScore}
          sort={p.sort}
          quarantinedCount={jobs.quarantinedCount}
          filteredCount={jobs.filteredCount}
          needsLookCount={jobs.needsLookCount}
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
      </Toolbar>
      {/* One context line: the notice (what you're looking for, or a
          higher-priority one) and the starred-region coverage beside it. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {notices.length > 0 ? (
          <div className="min-w-0 flex-[1_1_28rem]">
            <NoticeArea notices={notices} />
          </div>
        ) : null}
        <CoverageLine rows={toRowViews(coverage)} />
      </div>
      {jobs.regionGroups ? <RegionGroups groups={jobs.regionGroups} searchParams={sp} selected={p.region} /> : null}
      <DiscoveryInbox
        kind="jobs"
        items={withScreens(toJobRows(jobs, sourceNameById, growthInFit), screens)}
        quarantineView={p.status === 'quarantined'}
        filteredView={p.status === 'filtered'}
        pager={<DiscoveryPager searchParams={sp} page={p.page} size={p.size} total={total} position="top" />}
      />
      {total > p.size ? (
        <DiscoveryPager searchParams={sp} page={p.page} size={p.size} total={total} position="bottom" />
      ) : null}
      {p.status === 'new' && jobs.needsLookCount > 0 ? <NeedsALookLink count={jobs.needsLookCount} sp={sp} /> : null}
    </div>
  )
}

/**
 * "Needs a look", collapsed under New: non-engineering titles whose JD shows
 * no tech evidence. Kept (never filtered on a title alone), one click away.
 * The ONE place the group opens from; the subtitle count and the sidebar
 * badge link to the same view (lib/ui/discovery-counts.ts NEEDS_LOOK_HREF).
 */
function NeedsALookLink({ count, sp }: { count: number; sp: Record<string, string | undefined> }): React.ReactElement {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v && k !== 'page' && k !== 'status') params.set(k, v)
  params.set('tab', 'jobs')
  params.set('status', 'review')
  return (
    <p className="text-sm text-muted-foreground" data-testid="needs-a-look">
      <Link href={`/discoveries?${params.toString()}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        Needs a look ({count})
      </Link>
      {' '}· non-tech titles with no tech evidence in the job description, kept out of New.
    </p>
  )
}

/** Discovery › Companies: local companies worth approaching, even without a posting. */
async function CompaniesView({
  userId,
  profile,
  sp,
  size,
}: {
  userId: string
  profile: UserProfile | null
  sp: Record<string, string | undefined>
  size: number
}): Promise<React.ReactElement> {
  const prefs = searchPrefsFromProfile(profile)
  const prompts = companyPrompts({ regionIds: prefs.regionIds, starred: prefs.extra.preferredRegions.map((r) => r.id), families: targetFamilies(prefs) })
  const sources = await sourcesQ.list(userId)
  const lastRun = sources.find((s) => s.kind === LOCAL_COMPANIES_KIND)?.lastPolledAt ?? null
  return (
    <div className="space-y-3">
      <PageHeader
        title="Discovery"
        description="Local companies and startups worth approaching, even without a posting."
        className="mb-0"
        inlineActions
        actions={<CompaniesHeaderActions prompts={prompts} />}
      />
      <TabBar tab="companies" />
      <Suspense fallback={<CompaniesSkeleton />}>
        <CompaniesTab userId={userId} params={parseCompanyParams(sp, size)} prefs={prefs} searchParams={sp} lastRun={lastRun} />
      </Suspense>
    </div>
  )
}

/** The one toolbar row: Jobs | Companies, the filters, then Board | List at the end. */
function Toolbar({
  tab,
  toggle,
  children,
}: {
  tab: 'jobs' | 'companies'
  toggle: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    // Wide main column: one row (tabs · filters · view). Narrower: tabs and view share the
    // first row and the filters take their own full-width row below.
    <div className="flex flex-wrap items-center gap-2" data-testid="discovery-toolbar">
      <TabBar tab={tab} />
      <div className="order-last w-full min-w-0 @4xl/main:order-none @4xl/main:w-auto @4xl/main:flex-1">{children}</div>
      <div className="ml-auto">{toggle}</div>
    </div>
  )
}

function toJobRows(jobs: JobsData, sourceNameById: Map<string, string>, growthInFit: boolean): DiscoveryRowJob[] {
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
      growth: d.companyGrowth !== null ? { score: d.companyGrowth, confidence: d.companyGrowthConfidence, inFit: growthInFit } : null,
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
        localHire: d.localHire,
        titleOnly: d.titleOnly,
      },
      reasoning: (d.matchReasoning as DiscoveryReasoning | null) ?? null,
      scoredByCallId: d.scoredByCallId,
      risk: risk ? toRiskView(risk, sourceName) : null,
      filterReason: d.filterReason,
      notes: d.relevanceNotes,
      post: toPostRowView(d.post),
      needsLook: isNeedsLook(d),
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
    <nav aria-label="Discovery sections" className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={`/discoveries?tab=${t.id}`}
          aria-current={tab === t.id ? 'page' : undefined}
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
    </nav>
  )
}
