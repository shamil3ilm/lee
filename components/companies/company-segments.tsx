import Link from 'next/link'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

/**
 * The Companies tab's segments (a segmented control of links, like the
 * Jobs / Companies switch): Suggested · Under the radar · Watching · All,
 * each with its count under the current filters. Switching keeps the
 * filters and resets the page.
 */

export const SEGMENTS = [
  { id: 'suggested', label: 'Suggested', more: ' for you' },
  { id: 'radar', label: 'Under the radar' },
  { id: 'watching', label: 'Watching' },
  { id: 'all', label: 'All' },
] as const

export function CompanySegments({
  view,
  counts,
  searchParams,
}: {
  view: string
  counts: Readonly<Record<string, number>>
  searchParams: Record<string, string | undefined>
}) {
  const href = (id: string): string => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) if (v && !['view', 'status', 'page'].includes(k)) q.set(k, v)
    q.set('tab', 'companies')
    if (id !== 'suggested') q.set('view', id)
    return `/discoveries?${q.toString()}`
  }
  return (
    <nav aria-label="Company segments" className="flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 lg:w-fit" data-testid="company-segments">
      {SEGMENTS.map((s) => {
        const current = view === s.id
        return (
          <Link
            key={s.id}
            href={href(s.id)}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors lg:flex-none',
              focusRing,
              current ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`company-segment-${s.id}`}
          >
            <span>
              {s.label}
              {'more' in s ? <span className="hidden xl:inline">{s.more}</span> : null}
            </span>
            <span className="rounded-full bg-background/60 px-1.5 text-xs tabular-nums text-foreground">{counts[s.id] ?? 0}</span>
          </Link>
        )
      })}
    </nav>
  )
}
