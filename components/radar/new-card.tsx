import { ExternalLink } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ChipKind } from '@/lib/radar/new/rank'
import type { NewEntryView } from '@/lib/radar/new/view'
import { shortDay } from '@/lib/ui/date'
import { cn } from '@/lib/utils'
import { NewActions } from './new-actions'

const CHIP_VARIANT: Readonly<Record<ChipKind, BadgeProps['variant']>> = {
  relevance: 'success',
  traction: 'info',
  sources: 'info',
  official: 'warning',
  fresh: 'neutral',
}

/** One "what's new" entry: what it is, why it ranks (chips), where it comes from, and the actions. */
export function NewCard({ entry }: { entry: NewEntryView }) {
  return (
    <Card className={cn('min-w-0', entry.relevant && 'border-success/40')} data-testid="whats-new-entry">
      <CardContent className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 break-words font-semibold text-foreground hover:underline"
          >
            {entry.name}
            <ExternalLink className="ml-1 inline size-3 text-muted-foreground" aria-hidden />
          </a>
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.groupLabel ? <Badge variant="neutral">{entry.groupLabel}</Badge> : null}
            {entry.openness === 'open' ? <Badge variant="success">Open</Badge> : null}
            {entry.openness === 'proprietary' ? <Badge variant="neutral">Proprietary</Badge> : null}
            {entry.variantCount > 0 ? <Badge variant="outline">+{entry.variantCount} variants</Badge> : null}
          </div>
        </div>
        {entry.excerpt ? <p className="break-words text-sm text-muted-foreground">{entry.excerpt}</p> : null}
        {entry.facts.length > 0 ? <p className="text-xs text-muted-foreground">{entry.facts.join(' · ')}</p> : null}
        {entry.chips.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Why it ranks">
            {entry.chips.map((c) => (
              <li key={`${c.kind}:${c.label}`}>
                <Badge variant={CHIP_VARIANT[c.kind]}>{c.label}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {entry.createdDay ? <span>Created {shortDay(entry.createdDay)}</span> : null}
          <span>First seen {shortDay(entry.firstSeenDay)}</span>
          {entry.sources.map((s) => (
            <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {s.label}
            </a>
          ))}
        </p>
        <NewActions id={entry.id} name={entry.name} watched={entry.watched} entryId={entry.entryId} />
      </CardContent>
    </Card>
  )
}
