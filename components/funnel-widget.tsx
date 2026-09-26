import { Card, CardContent } from '@/components/ui/card'

interface FunnelWidgetProps {
  /** Count of applications in each active pipeline stage. */
  counts: {
    applied: number
    screen: number
    interview: number
    offer: number
    rejected: number
    withdrawn: number
  }
}

const STAGES: Array<{ key: 'applied' | 'screen' | 'interview' | 'offer'; label: string; bar: string }> = [
  { key: 'applied', label: 'Applied', bar: 'bg-blue-500 dark:bg-blue-400' },
  { key: 'screen', label: 'Screen', bar: 'bg-indigo-500 dark:bg-indigo-400' },
  { key: 'interview', label: 'Interview', bar: 'bg-violet-500 dark:bg-violet-400' },
  { key: 'offer', label: 'Offer', bar: 'bg-emerald-500 dark:bg-emerald-400' },
]

/**
 * Conversion pct from the previous stage. Returns `null` when the previous
 * stage was empty (division by zero) so the caller can render an em-dash.
 */
function pctFromPrev(count: number, prev: number): number | null {
  if (prev <= 0) return null
  return Math.round((count / prev) * 100)
}

/**
 * Response-rate funnel: Applied → Screen → Interview → Offer with per-stage
 * conversion % from the previous stage. Rejected + Withdrawn are shown as a
 * quiet footnote so they contextualize the drop without dominating.
 */
export function FunnelWidget({ counts }: FunnelWidgetProps) {
  const total = counts.applied + counts.screen + counts.interview + counts.offer
  const totalWithTerminal = total + counts.rejected + counts.withdrawn
  const isEmpty = totalWithTerminal === 0

  const max = Math.max(
    counts.applied,
    counts.screen,
    counts.interview,
    counts.offer,
    1,
  )

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Funnel
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Conversion between pipeline stages.
          </p>
        </div>

        {isEmpty ? (
          <p className="text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {STAGES.map((stage, i) => {
                const count = counts[stage.key]
                const prev = i === 0 ? null : counts[STAGES[i - 1]!.key]
                const pct = prev === null ? null : pctFromPrev(count, prev)
                const width = Math.max((count / max) * 100, count > 0 ? 4 : 0)
                return (
                  <div key={stage.key} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 text-muted-foreground">
                      {stage.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="h-6 w-full overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full ${stage.bar} transition-all`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                    {/* Figures sit beside the bar, not on it: muted text over a
                        saturated bar was unreadable (v17 §9.1 visual QA). */}
                    <span className="w-20 shrink-0 text-right text-xs sm:w-40">
                      <span className="font-medium tabular-nums text-foreground">{count}</span>
                      {pct !== null ? (
                        <span className="ml-1.5 text-muted-foreground">
                          {pct}%
                          <span className="hidden sm:inline">
                            {' '}from {STAGES[i - 1]!.label.toLowerCase()}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>

            {counts.rejected + counts.withdrawn > 0 ? (
              <p className="text-xs text-muted-foreground">
                {counts.rejected} rejected · {counts.withdrawn} withdrawn
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
