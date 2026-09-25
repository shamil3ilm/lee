import Link from 'next/link'
import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import type { RunSummaryView } from '@/lib/lab/run-summary'

interface RecentRunsProps {
  runs: RunSummaryView[]
  /** Reference time from the server render, so relative times are stable. */
  now: Date
}

export function RecentRuns({ runs, now }: RecentRunsProps) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="No runs yet"
        description="Compare models side by side in the Arena — every run is saved here."
        className="py-10"
      />
    )
  }
  return (
    <ul className="divide-y rounded-md border">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/lab/runs/${r.id}`}
            className="flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm">{r.promptPreview || '(empty prompt)'}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {r.blind ? (
                <Badge variant={r.voted ? 'emerald' : 'violet'}>{r.voted ? 'voted' : 'blind'}</Badge>
              ) : null}
              <span>{r.modelCount} models</span>
              <span>{relative(new Date(r.createdAt), now)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function relative(when: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - when.getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
