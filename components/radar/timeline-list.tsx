import type { TimelineEvent } from '@/lib/radar/brief/types'

/** Dated facts, oldest first. Days are UTC calendar days, shown US style with the year. */
function dayWithYear(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? isoDay : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function TimelineList({ events }: { events: readonly TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No dated facts yet.</p>
  return (
    <ol className="space-y-1.5 text-sm" aria-label="Timeline">
      {events.map((e) => (
        <li key={`${e.label}-${e.date}`} className="flex min-w-0 gap-3">
          <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{dayWithYear(e.date)}</span>
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words hover:underline">
              {e.label}
            </a>
          ) : (
            <span className="min-w-0 break-words">{e.label}</span>
          )}
        </li>
      ))}
    </ol>
  )
}
