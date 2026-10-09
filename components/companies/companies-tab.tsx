import { Building2 } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { DiscoveryPager } from '@/components/discovery/pager'
import { loadCompanyCards, type CompanyParams } from '@/app/(authed)/discoveries/companies-data'
import { companyPrompts } from '@/lib/company-discovery/ai-prompts'
import { targetFamilies, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { BrowseDirectories } from './browse-directories'
import { CompanyCard } from './company-card'
import { CompanyFilters } from './company-filters'
import { PasteCompaniesDialog } from './paste-companies-dialog'

/**
 * Discovery › Companies: local companies and startups that may not post on
 * job portals, ranked by an explainable company fit, with filters, the
 * "Browse directories" panel and the add / AI Mode hand-off.
 */
export async function CompaniesTab({
  userId,
  params,
  prefs,
  searchParams,
}: {
  userId: string
  params: CompanyParams
  prefs: SearchPrefs
  searchParams: Record<string, string | undefined>
}) {
  const { cards, total, facets } = await loadCompanyCards(userId, params)
  const prompts = companyPrompts({
    regionIds: prefs.regionIds,
    starred: prefs.extra.preferredRegions.map((r) => r.id),
    families: targetFamilies(prefs),
  })
  const pager = <DiscoveryPager searchParams={searchParams} page={params.page} size={params.size} total={total} position="top" />
  return (
    <div className="space-y-4" data-testid="companies-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Local companies and startups from Wikidata, GitHub, Y Combinator, park directories and your LinkedIn connections, refreshed weekly. Star preferred regions in Settings › Search to rank them higher.
        </p>
        <PasteCompaniesDialog prompts={prompts} />
      </div>
      <CompanyFilters
        status={params.status}
        region={params.region}
        industry={params.industry}
        stage={params.stage}
        hiring={params.hiring}
        warm={params.warm}
        source={params.source}
        industries={facets.industries}
        sources={facets.sources}
        total={total}
      />
      <BrowseDirectories />
      {cards.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={params.status === 'new' ? 'No companies yet' : 'Nothing here'}
          description="The weekly search fills this list. Add companies yourself, or run the search now from “Add companies”."
        />
      ) : (
        <>
          {total > params.size ? pager : null}
          <ul className="space-y-3" aria-label="Companies">
            {cards.map((c) => (
              <CompanyCard key={c.id} c={c} />
            ))}
          </ul>
          {total > params.size ? <DiscoveryPager searchParams={searchParams} page={params.page} size={params.size} total={total} position="bottom" /> : null}
        </>
      )}
    </div>
  )
}
