import { shortDay } from '@/lib/ui/date'
import type { FirstSeenView } from '@/lib/radar/view'

/** First-seen date per source (earliest publication, else when lee first saw it). */
export function FirstSeenList({ firstSeen, compact = false }: { firstSeen: readonly FirstSeenView[]; compact?: boolean }) {
  if (firstSeen.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="First seen per source">
      {firstSeen.map((f) => (
        <li key={f.source} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{f.label}</span> · first seen {shortDay(f.day)}
          {!compact && f.items > 1 ? ` · ${f.items} items` : ''}
        </li>
      ))}
    </ul>
  )
}
