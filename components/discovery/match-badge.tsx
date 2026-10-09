'use client'
import { Info } from 'lucide-react'
import { badgeVariants, type BadgeProps } from '@/components/ui/badge'
import { focusRing } from '@/components/ui/focus-ring'
import { ResponsivePopover } from '@/components/responsive-popover'
import { cappedFit, fitText, scoreBand, withNudge, type ScoreBand } from '@/lib/discovery/match/blend'
import { cn } from '@/lib/utils'
import { growthNudgeOf, MatchWhy, type MatchWhyProps } from './match-why'

export { MatchWhy } from './match-why'

/**
 * The score badge on every job surface (list rows, board cards, shortlist
 * cards, Home): ONE number, "Fit 76", coloured by band. Match, AI, Benefits
 * and the reasons live in the "Why this score" popover, which is a bottom
 * sheet on phones. `interactive={false}` renders the bare badge (e.g. inside
 * a link, where a button may not nest).
 */

const BAND_VARIANT: Readonly<Record<ScoreBand, BadgeProps['variant']>> = {
  strong: 'success',
  good: 'info',
  fair: 'warning',
  weak: 'danger',
}

export interface MatchBadgeProps extends MatchWhyProps {
  interactive?: boolean
  className?: string
}

function stop(e: { stopPropagation: () => void }): void {
  // Keep clicks and drags on the badge from opening the card link or starting a board drag.
  e.stopPropagation()
}

export function MatchBadge({ interactive = true, className, ...why }: MatchBadgeProps) {
  const { match, ai, detail } = why
  const nudge = growthNudgeOf(why.growth)
  const fit = withNudge(cappedFit(match, ai, detail), nudge)
  const titleOnly = detail?.confidence === 'title_only' && ai === null
  const variant = fit === null || titleOnly ? 'neutral' : BAND_VARIANT[scoreBand(fit)]
  const band = fit === null ? undefined : titleOnly ? 'low' : scoreBand(fit)
  const text = fitText(match, ai, { titleOnly, ceiling: detail?.ceiling?.score, nudge })
  // A <span> (not the <div> Badge) so it may sit inside the trigger button.
  const badge = (
    <span
      data-testid="match-badge"
      data-band={band}
      className={cn(badgeVariants({ variant }), 'gap-1 tabular-nums', className)}
      title={interactive ? undefined : text}
    >
      {text}
      {interactive ? <Info className="size-3" aria-hidden="true" /> : null}
    </span>
  )
  if (!interactive) return badge
  return (
    // Same guard as the board's card menu: pointer, mouse, touch and key
    // events on the badge never start a card drag or follow a card link.
    <span
      className="inline-flex"
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onKeyDown={stop}
      onClick={stop}
    >
      <ResponsivePopover
        title="Why this score"
        onContentEvent={stop}
        trigger={
          <button type="button" aria-label={`${text}. Why this score`} className={cn('rounded-md', focusRing)}>
            {badge}
          </button>
        }
      >
        <MatchWhy {...why} />
      </ResponsivePopover>
    </span>
  )
}
