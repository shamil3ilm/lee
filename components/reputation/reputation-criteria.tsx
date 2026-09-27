import type { CriterionScore } from '@/lib/reputation/criteria'

function effectText(n: number): string {
  if (n === 0) return ''
  return n > 0 ? `+${n}` : `${n}`
}

/** How confirmed reputation moves the Opportunity Score criteria — every point explained. */
export function ReputationCriteria({ criteria }: { criteria: CriterionScore[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {criteria.map((c) => (
        <div key={c.criterion} className="rounded-md border px-3 py-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{c.label}</span>
            <span className="tabular-nums">
              {c.score === null ? 'Unknown' : `${c.score}/100`}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Confidence {Math.round(c.confidence * 100)}%{c.score !== null ? ` · base ${c.base}` : ''}
          </div>
          {c.evidence.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs">
              {c.evidence.map((e) => (
                <li key={e.label} className="flex justify-between gap-2">
                  <span>{e.label}</span>
                  <span className="tabular-nums text-muted-foreground">{effectText(e.effect)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Record a rating or confirm a summary to score this.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
