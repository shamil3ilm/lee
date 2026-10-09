import Link from 'next/link'
import { Building2, Eye, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { DiscoveryPager } from '@/components/discovery/pager'
import { loadCompanyCards, type CompanyParams } from '@/app/(authed)/discoveries/companies-data'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { shortName } from '@/lib/regions/tree'
import { relativeFromNow } from '@/lib/ui/date'
import { Button } from '@/components/ui/button'
import { BrowseDirectories } from './browse-directories'
import { CompanyList } from './company-list'
import { CompanySearch } from './company-search'
import { CompanySegments } from './company-segments'
import { CompanyToolbar, type QuickRegion } from './company-toolbar'
import { SourcesNote } from './sources-note'

/**
 * Discovery › Companies: local companies and startups that may not post on
 * job portals. One question per row ("is this company worth my time?"),
 * segments (Suggested · Under the radar · Watching · All), a compact
 * toolbar, bulk Watch / Not interested, and where the companies come from
 * in one line. Browse-only directories sit folded at the bottom.
 */

const QUICK_MAX = 4

/** Region quick chips: starred regions first (top priority before preferred), then the target regions. */
export function quickRegions(prefs: Pick<SearchPrefs, 'regionIds'> & { extra: { preferredRegions: ReadonlyArray<{ id: string; level: string }> } }): QuickRegion[] {
  const starred = [...prefs.extra.preferredRegions].sort((a, b) => Number(b.level === 'top') - Number(a.level === 'top')).map((r) => r.id)
  const ids = [...new Set([...starred, ...prefs.regionIds])].slice(0, QUICK_MAX)
  return ids.map((id) => ({ id, label: shortName(id), starred: starred.includes(id) }))
}

function Empty({ params, filtered }: { params: CompanyParams; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        icon={Building2}
        title="No companies match these filters"
        description="Remove a filter, or switch to All."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={`/discoveries?tab=companies${params.view === 'suggested' ? '' : `&view=${params.view}`}`}>Clear filters</Link>
          </Button>
        }
      />
    )
  }
  if (params.view === 'watching') {
    return <EmptyState icon={Eye} title="You are not watching any company yet" description="Watch a company to follow its job board or careers page; it then shows here." />
  }
  if (params.view === 'radar') {
    return (
      <EmptyState
        icon={Sparkles}
        title="No hidden gems yet"
        description="Small companies with good fit and growing hiring but little press show here once their growth signals build up (weekly)."
      />
    )
  }
  if (params.view === 'dismissed') return <EmptyState icon={Building2} title="Nothing here" description="Companies you mark “Not interested” show here; you can restore them." />
  return (
    <EmptyState
      icon={Building2}
      title="No companies yet"
      description="The weekly search fills this list from IT-park and member lists, your jobs, GitHub and Wikidata. Find a company by name above, or add companies from text."
    />
  )
}

export async function CompaniesTab({
  userId,
  params,
  prefs,
  searchParams,
  lastRun,
}: {
  userId: string
  params: CompanyParams
  prefs: SearchPrefs
  searchParams: Record<string, string | undefined>
  lastRun: Date | null
}) {
  const { cards, total, facets, counts } = await loadCompanyCards(userId, params)
  const filtered = params.region.length > 0 || !!params.industry || !!params.stage || params.hiring || params.warm || !!params.source || params.minGrowth > 0 || params.gems
  const pager = (position: 'top' | 'bottom') => <DiscoveryPager searchParams={searchParams} page={params.page} size={params.size} total={total} position={position} />
  return (
    <div className="space-y-3" data-testid="companies-tab">
      <SourcesNote lastRun={lastRun ? relativeFromNow(lastRun) : null} />
      <CompanySearch />
      <CompanySegments view={params.view} counts={counts} searchParams={searchParams} />
      {params.view === 'dismissed' ? (
        <p className="text-sm text-muted-foreground" data-testid="company-dismissed-heading">
          Companies you marked not interested.{' '}
          <Link href="/discoveries?tab=companies" className="underline underline-offset-4">
            Back to suggestions
          </Link>
        </p>
      ) : null}
      <CompanyToolbar
        view={params.view}
        region={params.region}
        quickRegions={quickRegions(prefs)}
        sort={params.sort}
        minGrowth={params.minGrowth}
        gems={params.gems}
        stage={params.stage}
        industry={params.industry}
        source={params.source}
        hiring={params.hiring}
        warm={params.warm}
        industries={facets.industries}
        sources={facets.sources}
        total={total}
        dismissedCount={counts.dismissed}
      />
      {cards.length === 0 ? (
        <Empty params={params} filtered={filtered} />
      ) : (
        <>
          {total > params.size ? pager('top') : null}
          <CompanyList cards={cards} dismissedView={params.view === 'dismissed'} />
          {total > params.size ? pager('bottom') : null}
        </>
      )}
      <BrowseDirectories />
    </div>
  )
}
