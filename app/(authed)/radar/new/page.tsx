import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { newHref, parseNewParams } from '@/lib/radar/new/filters'
import { loadWhatsNew } from '@/lib/radar/new/view'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { NewCard } from '@/components/radar/new-card'
import { NewFilters } from '@/components/radar/new-filters'

export const dynamic = 'force-dynamic'

export default async function WhatsNewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUserId()
  const { filters, page } = parseNewParams(await searchParams)
  const data = await loadWhatsNew(userId, filters, page)
  const single = filters.category !== null
  const filtered = single || filters.group !== null || filters.openOnly || filters.relevantOnly || filters.period !== 'week'

  return (
    <div className="space-y-6">
      <PageHeader
        title="What's new"
        description="New models, tools, releases, papers and launches, no watch terms needed. Fetched once a day from free public sources for everyone, then ranked for you: traction, more than one source, official sources and your skills, study list and role families. The chips say why."
      />
      <NewFilters filters={filters} />
      {data.total === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={filtered ? 'Nothing matches these filters' : 'Nothing new yet'}
          description={
            filters.relevantOnly && data.personal.topics === 0
              ? 'Mark skills interview-ready in your master profile or set role families in search preferences to rank items for you.'
              : 'Sources are fetched once a day in the background.'
          }
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href="/radar/new">Clear filters</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        data.sections
          .filter((s) => s.entries.length > 0)
          .map((s) => (
            <section key={s.category} aria-labelledby={`new-${s.category}`} className="space-y-3" data-testid="whats-new-section">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`new-${s.category}`} className="text-lg font-semibold">
                  {s.label} <span className="text-sm font-normal text-muted-foreground">({s.total})</span>
                </h2>
                {!single && s.total > s.entries.length ? (
                  <Link href={newHref({ ...filters, category: s.category })} className="text-sm text-primary hover:underline">
                    All {s.total} {s.label.toLowerCase()}
                  </Link>
                ) : null}
              </div>
              <div className="grid gap-4 @3xl/main:grid-cols-2">
                {s.entries.map((e) => (
                  <NewCard key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ))
      )}
      {single && (page > 0 || data.hasMore) ? (
        <nav aria-label="What's new pages" className="flex items-center justify-between gap-2">
          {page > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={newHref(filters, page - 1)}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          {data.hasMore ? (
            <Button asChild variant="outline" size="sm">
              <Link href={newHref(filters, page + 1)}>Next</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Releases follow {data.personal.releaseProjects.length} project(s){data.personal.releaseProjectsDerived ? ' picked from your profile' : ''}.{' '}
        <Link href="/radar/sources#releases" className="text-primary hover:underline">
          Edit the release list
        </Link>
      </p>
    </div>
  )
}
