import { Badge } from '@/components/ui/badge'
import { AXIS_LABELS, EVALUATION_AXES, type AttemptEvaluation } from '@/lib/academy/evaluation/types'

/** The multi-axis score: each axis scored or explicitly "n/a" for this format. */
export function EvaluationPanel({ evaluation }: { evaluation: AttemptEvaluation }) {
  return (
    <div className="space-y-3" data-testid="evaluation">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{evaluation.composite}</span>
        <span className="text-sm text-muted-foreground">/ 100 composite</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {EVALUATION_AXES.map((axis) => {
          const a = evaluation[axis]
          return (
            <div key={axis} className="min-w-0 rounded-lg border p-2">
              <dt className="truncate text-xs text-muted-foreground">{AXIS_LABELS[axis]}</dt>
              <dd className="text-sm font-medium tabular-nums">
                {a.status === 'scored' ? (
                  a.score
                ) : (
                  <Badge variant="neutral" title={a.reason || undefined}>
                    n/a
                  </Badge>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      {evaluation.improvements.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {evaluation.improvements.map((t) => (
            <li key={t} className="break-words">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
