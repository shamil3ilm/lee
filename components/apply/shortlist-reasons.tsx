import type { RankReason } from '@/lib/apply/rank'
import { ReasonChips } from './reason-chips'

interface ShortlistReasonsProps {
  rank: number
  /** The composite shortlist score that sets the order. */
  score: number
  reasons: readonly RankReason[]
}

/**
 * Inside a shortlist card's "Why this score": where the pick ranks today
 * and every part of the shortlist score. The Fit part is already in the
 * breakdown above, so its chip is left out here.
 */
export function ShortlistReasons({ rank, score, reasons }: ShortlistReasonsProps) {
  const parts = reasons.filter((r) => r.kind !== 'match')
  return (
    <div data-testid="shortlist-reasons" className="space-y-1.5 border-t pt-2">
      <p className="text-xs">
        <span className="font-medium">#{rank} on today’s shortlist</span>
        <span className="text-muted-foreground"> · shortlist score {score}/100 = half of Fit, plus:</span>
      </p>
      {parts.length > 0 ? (
        <ReasonChips reasons={parts} max={10} />
      ) : (
        <p className="text-xs text-muted-foreground">Nothing else moved it up or down.</p>
      )}
    </div>
  )
}
