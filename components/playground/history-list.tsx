import Link from 'next/link'
import { History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { LocalTime } from '@/components/local-time'
import type { HistoryEntry } from '@/lib/academy/service/views'
import { FORMAT_LABELS, MODE_LABELS } from './labels'

function delta(e: HistoryEntry): string | null {
  if (e.ratingBefore === null || e.ratingAfter === null) return null
  const d = Math.round(e.ratingAfter - e.ratingBefore)
  return d === 0 ? '±0' : d > 0 ? `+${d}` : String(d)
}

/** Append-only attempt timeline (newest first). */
export function HistoryList({ entries, showSkill = true }: { entries: HistoryEntry[]; showSkill?: boolean }) {
  if (entries.length === 0) {
    return <EmptyState icon={History} size="sm" title="No attempts yet" description="Finished items appear here, with their scores." />
  }
  return (
    <ol className="divide-y rounded-xl border" aria-label="Attempt history">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="history-entry">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {showSkill ? (
                <Link href={`/playground/skills/${e.skillId}`} className="break-words font-medium text-primary underline-offset-4 hover:underline">
                  {e.skillName}
                </Link>
              ) : null}
              <Badge variant={e.correct ? 'success' : 'danger'}>{e.correct ? 'Correct' : 'Missed'}</Badge>
              <span className="text-xs text-muted-foreground">
                {FORMAT_LABELS[e.format] ?? e.format} · {MODE_LABELS[e.mode] ?? e.mode}
                {e.domain ? ` · ${e.domain}` : ''}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <LocalTime date={e.submittedAt} format="datetime-year" /> · content {e.contentVersion} · engine {e.engineVersion}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
            <span title="Composite score">{e.composite}/100</span>
            {delta(e) ? <span title="Rating change">{delta(e)}</span> : null}
            <span title="XP">+{e.xp} XP</span>
            <Link href={`/playground/play/${e.id}`} className="text-primary underline-offset-4 hover:underline">
              Open
            </Link>
          </div>
        </li>
      ))}
    </ol>
  )
}
