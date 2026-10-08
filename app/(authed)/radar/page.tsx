import Link from 'next/link'
import { Radar } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { feedHref, parseFeedParams } from '@/lib/radar/filters'
import { loadFeed } from '@/lib/radar/view'
import { plural } from '@/lib/ui/labels'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { EntryCard } from '@/components/radar/entry-card'
import { FeedFilters } from '@/components/radar/feed-filters'
import { RefreshRadarButton } from '@/components/radar/refresh-button'

export const dynamic = 'force-dynamic'
// Refresh now drains the radar jobs inside this page's server action.
export const maxDuration = 60

export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUserId()
  const { filters, page, raw } = parseFeedParams(await searchParams)
  const [{ entries, hasMore }, terms] = await Promise.all([loadFeed(userId, filters, page), termsQ.list(userId)])
  const filtered = Object.keys(filters).length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Radar"
        description="New AI models, products, papers and repos from free public sources, grouped into entries. Your watch terms are highlighted; briefs are built only from fetched primary sources."
        actions={<RefreshRadarButton />}
      />
      <FeedFilters raw={raw} status={hasMore ? `${plural(entries.length, 'entry', 'entries')} on this page` : plural(entries.length, 'entry', 'entries')} />
      {entries.length === 0 ? (
        <EmptyState
          icon={Radar}
          title={filtered ? 'Nothing matches these filters' : terms.length === 0 ? 'Watch a term to start the Radar' : 'Nothing fetched yet'}
          description={
            terms.length === 0
              ? 'The Radar runs once a day for accounts that watch at least one term.'
              : 'Sources are fetched once a day; use Refresh now to fetch them sooner.'
          }
          action={
            terms.length === 0 ? (
              <Button asChild>
                <Link href="/radar/watchlist">Add a watch term</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 @3xl/main:grid-cols-2">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
      {page > 0 || hasMore ? (
        <nav aria-label="Radar pages" className="flex items-center justify-between gap-2">
          {page > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={feedHref(raw, page - 1)}>Newer</Link>
            </Button>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Button asChild variant="outline" size="sm">
              <Link href={feedHref(raw, page + 1)}>Older</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}
