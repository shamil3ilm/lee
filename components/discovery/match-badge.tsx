'use client'
import { Info } from 'lucide-react'
import { badgeVariants, type BadgeProps } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { focusRing } from '@/components/ui/focus-ring'
import { BAND_LABELS, blendScores, scoreBand, scoreText, type ScoreBand } from '@/lib/discovery/match/blend'
import type { MatchComponent, MatchDetail } from '@/lib/discovery/match/types'
import { cn } from '@/lib/utils'

/**
 * The score badge on every discovery surface: "Match 72 · AI 80", coloured
 * by band, with a "Why this score" popover listing each component's points
 * and the missing must-haves. `interactive={false}` renders the bare badge
 * (e.g. inside a link, where a button may not nest).
 */

const BAND_VARIANT: Readonly<Record<ScoreBand, BadgeProps['variant']>> = {
  strong: 'success',
  good: 'info',
  fair: 'warning',
  weak: 'danger',
}

export interface MatchBadgeProps {
  match: number | null
  ai: number | null
  detail: MatchDetail | null
  interactive?: boolean
  /** Filtered by the relevance gate: AI never scores it, the Match Score still shows. */
  filtered?: boolean
  className?: string
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function stop(e: { stopPropagation: () => void }): void {
  // Keep clicks and drags on the badge from opening the card link or starting a board drag.
  e.stopPropagation()
}

function ComponentRow({ c }: { c: MatchComponent }) {
  const tone = c.points < 0 ? 'text-danger' : c.points === 0 ? 'text-muted-foreground' : 'text-foreground'
  return (
    <li className="flex items-start justify-between gap-3 py-1">
      <span className="min-w-0 text-xs leading-snug">{c.label}</span>
      <span className={cn('shrink-0 text-xs font-medium tabular-nums', tone)}>
        {signed(c.points)}
        {c.max > 0 ? <span className="text-muted-foreground">/{c.max}</span> : null}
      </span>
    </li>
  )
}

export function MatchWhy({ match, ai, detail, filtered }: Omit<MatchBadgeProps, 'interactive' | 'className'>) {
  const ranked = blendScores(match, ai)
  return (
    <div data-testid="match-why" className="space-y-2">
      <div>
        <p className="text-sm font-semibold">Why this score</p>
        <p className="text-xs text-muted-foreground">
          {match !== null ? `Match ${match}/100 · ${BAND_LABELS[scoreBand(match)]}` : 'Match Score pending (computed shortly)'}
        </p>
      </div>
      {detail && detail.components.length > 0 ? (
        <ul className="divide-y" aria-label="Score components">
          {detail.components.map((c) => (
            <ComponentRow key={c.key} c={c} />
          ))}
        </ul>
      ) : null}
      {detail && detail.missing.length > 0 ? (
        <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger" data-testid="match-missing">
          <span className="font-medium">Missing:</span> {detail.missing.join(', ')}
        </p>
      ) : null}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {ai !== null && match !== null
          ? `AI ${ai}. Ranked by the mean of both: ${ranked}.`
          : filtered
            ? 'Filtered postings are not AI-scored; the Match Score uses only your ready profile evidence.'
            : 'Deterministic, from your ready profile evidence only. An AI score refines it when available.'}
      </p>
    </div>
  )
}

export function MatchBadge({ match, ai, detail, interactive = true, filtered = false, className }: MatchBadgeProps) {
  const shown = match ?? ai
  const variant = shown === null ? 'neutral' : BAND_VARIANT[scoreBand(shown)]
  const band = shown === null ? undefined : scoreBand(shown)
  const text = scoreText(match, ai)
  // A <span> (not the <div> Badge) so it may sit inside the trigger button.
  const badge = (
    <span
      data-testid="match-badge"
      data-band={band}
      className={cn(badgeVariants({ variant }), 'gap-1 tabular-nums', className)}
      title={interactive ? undefined : text}
    >
      {text}
      {interactive ? <Info className="size-3 opacity-70" aria-hidden="true" /> : null}
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
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${text}. Why this score`} className={cn('rounded-md', focusRing)}>
            {badge}
          </button>
        </PopoverTrigger>
        <PopoverContent onPointerDown={stop} onMouseDown={stop} onClick={stop}>
          <MatchWhy match={match} ai={ai} detail={detail} filtered={filtered} />
        </PopoverContent>
      </Popover>
    </span>
  )
}
