import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { listEvents, parseEventFilters, TIME_RANGES, type EventFilters } from '@/lib/logs/queries'
import { CATEGORY_LABELS, EVENT_CATEGORIES } from '@/lib/logs/types'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { EventList } from '@/components/settings/event-list'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | undefined>

interface LogsPageProps {
  searchParams: Promise<SearchParams>
}

const RANGE_LABELS: Record<keyof typeof TIME_RANGES, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '60d': 'Last 60 days',
}

const FIELD =
  'h-9 rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function hrefFor(filters: EventFilters, page: number): string {
  const qs = new URLSearchParams()
  if (filters.category) qs.set('category', filters.category)
  if (filters.level) qs.set('level', filters.level)
  if (filters.range !== '7d') qs.set('range', filters.range)
  if (filters.q) qs.set('q', filters.q)
  if (filters.sourceId) qs.set('source', filters.sourceId)
  if (filters.jobId) qs.set('job', filters.jobId)
  if (page > 1) qs.set('page', String(page))
  const s = qs.toString()
  return s ? `/settings/logs?${s}` : '/settings/logs'
}

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const userId = await requireUserId()
  const { page, ...filters } = parseEventFilters(await searchParams)
  const { rows, hasNext } = await listEvents(userId, filters, page)
  const scoped = filters.sourceId || filters.jobId

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Logs"
        description="Background runs, syncs and problems, kept after the server logs expire: info for 14 days, warnings and errors for 60. Secrets are removed and email addresses reduced to their domain."
      />

      <form method="get" action="/settings/logs" className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter logs">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Category
          <select name="category" defaultValue={filters.category ?? ''} className={FIELD}>
            <option value="">All</option>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Level
          <select name="level" defaultValue={filters.level ?? ''} className={FIELD}>
            <option value="">All</option>
            <option value="problems">Warnings and errors</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Time
          <select name="range" defaultValue={filters.range} className={FIELD}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Message or event"
            maxLength={100}
            className={`${FIELD} w-full px-3`}
          />
        </label>
        {filters.sourceId ? <input type="hidden" name="source" value={filters.sourceId} /> : null}
        {filters.jobId ? <input type="hidden" name="job" value={filters.jobId} /> : null}
        <Button type="submit" size="default">
          Filter
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        {scoped ? (
          <>
            Showing events for one {filters.jobId ? 'job run' : 'source'}.{' '}
            <Link href="/settings/logs" className="underline underline-offset-2">
              Show all
            </Link>
            .{' '}
          </>
        ) : null}
        AI calls (models, tokens, latency) are in the AI usage cards on{' '}
        <Link href="/analytics" className="underline underline-offset-2">
          Analytics
        </Link>
        ; job results are in{' '}
        <Link href="/settings/jobs" className="underline underline-offset-2">
          Background jobs
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No events"
          description="Nothing matches these filters. Background runs, syncs and any problems will show up here."
        />
      ) : (
        <EventList events={rows} />
      )}

      {page > 1 || hasNext ? (
        <nav aria-label="Log pages" className="flex items-center justify-between pt-2">
          {page > 1 ? (
            <Link href={hrefFor(filters, page - 1)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">Page {page}</span>
          {hasNext ? (
            <Link href={hrefFor(filters, page + 1)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  )
}
