import type { EventView } from '@/lib/logs/queries'
import { CATEGORY_LABELS } from '@/lib/logs/types'
import { relativeFromNow } from '@/lib/ui/date'
import { EVENT_LEVEL_LABEL, EVENT_LEVEL_TONE } from '@/lib/ui/run-status'
import { Badge } from '@/components/ui/badge'
import { CopyJsonButton } from './copy-json-button'
import { LocalTime } from '@/components/local-time'

function toJson(e: EventView): string {
  return JSON.stringify(
    {
      at: e.createdAt.toISOString(),
      level: e.level,
      category: e.category,
      event: e.event,
      message: e.message,
      context: e.context,
      ...(e.jobId ? { jobId: e.jobId } : {}),
      ...(e.sourceId ? { sourceId: e.sourceId } : {}),
      scope: e.global ? 'global' : 'you',
    },
    null,
    2,
  )
}

/** Settings › Logs event stream. Context is collapsed until opened. */
export function EventList({ events }: { events: EventView[] }) {
  return (
    <ol className="divide-y rounded-md border" data-testid="event-list">
      {events.map((e) => {
        // The machine event key and scope live in the JSON under Details.
        const json = toJson(e)
        return (
          <li key={e.id} className="space-y-1 p-3" data-testid="event-row" data-level={e.level} data-category={e.category}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={EVENT_LEVEL_TONE[e.level]}>{EVENT_LEVEL_LABEL[e.level]}</Badge>
              <Badge variant="outline">{CATEGORY_LABELS[e.category]}</Badge>
              <span>
                {relativeFromNow(e.createdAt)} · <LocalTime date={e.createdAt} />
              </span>
              {e.global ? <span>· App-wide</span> : null}
            </div>
            <p className="break-words text-sm">{e.message}</p>
            <details className="group text-xs">
              <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                Details
              </summary>
              <div className="mt-2 space-y-2">
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed">
                  {json}
                </pre>
                <CopyJsonButton json={json} />
              </div>
            </details>
          </li>
        )
      })}
    </ol>
  )
}
