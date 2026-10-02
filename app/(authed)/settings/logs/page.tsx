import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { listEvents, parseEventFilters, TIME_RANGES, type EventFilters } from '@/lib/logs/queries'
import { CATEGORY_LABELS, EVENT_CATEGORIES } from '@/lib/logs/types'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { FormActions, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
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
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Logs"
        description="Background runs, syncs and problems, kept after the server logs expire: info for 14 days, warnings and errors for 60. Secrets are removed and email addresses reduced to their domain."
      />

      <form
        method="get"
        action="/settings/logs"
        role="search"
        aria-label="Filter logs"
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,11rem))_minmax(0,1fr)_auto]"
      >
        <FormField htmlFor="logs-category" label="Category">
          <NativeSelect id="logs-category" name="category" defaultValue={filters.category ?? ''}>
            <option value="">All</option>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="logs-level" label="Level">
          <NativeSelect id="logs-level" name="level" defaultValue={filters.level ?? ''}>
            <option value="">All</option>
            <option value="problems">Warnings and errors</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </NativeSelect>
        </FormField>
        <FormField htmlFor="logs-range" label="Time">
          <NativeSelect id="logs-range" name="range" defaultValue={filters.range}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="logs-q" label="Search" className="sm:col-span-2 lg:col-span-1">
          <Input
            id="logs-q"
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Message or event"
            maxLength={100}
          />
        </FormField>
        {filters.sourceId ? <input type="hidden" name="source" value={filters.sourceId} /> : null}
        {filters.jobId ? <input type="hidden" name="job" value={filters.jobId} /> : null}
        <FormActions>
          <Button type="submit" className="w-full sm:w-auto">
            Filter
          </Button>
        </FormActions>
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
          title="No events match."
          description="Nothing matches these filters. Background runs, syncs and any problems will show up here."
        />
      ) : (
        <EventList events={rows} />
      )}

      {page > 1 || hasNext ? (
        <nav aria-label="Log pages" className="flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={hrefFor(filters, page - 1)}>Newer</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">Page {page}</span>
          {hasNext ? (
            <Button asChild variant="outline" size="sm">
              <Link href={hrefFor(filters, page + 1)}>Older</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  )
}
