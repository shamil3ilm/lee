import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { shortDay } from '@/lib/ui/date'
import { RADAR_KIND_LABELS } from '@/lib/radar/types'
import type { EntryView } from '@/lib/radar/view'
import { cn } from '@/lib/utils'
import { EntryActions } from './entry-actions'
import { FirstSeenList } from './first-seen'
import { Highlighted } from './highlighted'

/** One Radar entry in the feed: name, kind, watch terms, first seen per source, newest items. */
export function EntryCard({ entry }: { entry: EntryView }) {
  const watched = entry.terms.length > 0
  return (
    <Card className={cn('min-w-0', watched && !entry.read && 'border-warning/40')} data-testid="radar-entry">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/radar/${entry.id}`} className="min-w-0 flex-1 break-words font-semibold text-foreground hover:underline">
            {entry.name}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5">
            {watched && !entry.read ? <Badge variant="warning">New</Badge> : null}
            <Badge variant="neutral">{RADAR_KIND_LABELS[entry.kind]}</Badge>
            {entry.hasBrief ? (
              <Badge variant="info" className="gap-1">
                <FileText className="size-3" aria-hidden /> Brief
              </Badge>
            ) : null}
          </div>
        </div>
        {watched ? (
          <p className="text-xs text-muted-foreground">
            Watch terms: {entry.terms.map((t) => t.label).join(', ')}
          </p>
        ) : null}
        <FirstSeenList firstSeen={entry.firstSeen} compact />
        <ul className="space-y-1.5 text-sm">
          {entry.items.map((i) => (
            <li key={i.id} className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">{shortDay(i.day)}</span>
              <a
                href={i.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 break-words hover:underline"
              >
                <Highlighted segments={i.title} />
                <ExternalLink className="ml-1 inline size-3 text-muted-foreground" aria-hidden />
                <span className="sr-only"> (opens {i.sourceLabel})</span>
              </a>
            </li>
          ))}
        </ul>
        {entry.itemCount > entry.items.length ? (
          <Link href={`/radar/${entry.id}`} className="text-xs text-primary hover:underline">
            All {entry.itemCount} items
          </Link>
        ) : null}
        <EntryActions entryId={entry.id} name={entry.name} read={entry.read} saved={entry.saved} terms={entry.terms} />
      </CardContent>
    </Card>
  )
}
