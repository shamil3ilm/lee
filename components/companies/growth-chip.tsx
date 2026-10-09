'use client'
import { ExternalLink, Info, TrendingUp } from 'lucide-react'
import { badgeVariants } from '@/components/ui/badge'
import { focusRing } from '@/components/ui/focus-ring'
import { ResponsivePopover } from '@/components/responsive-popover'
import { growthChipText } from '@/lib/company-discovery/growth/combine'
import { GROWTH_LABELS, GROWTH_WEIGHTS, type GrowthSignal } from '@/lib/company-discovery/growth/types'
import { cn } from '@/lib/utils'
import type { CompanyGrowthCard } from './types'

/**
 * "Growth 78 · high confidence" on a company card, with a "Why" popover
 * (a bottom sheet on phones) listing every signal: what was measured, its
 * source, date and confidence, and the ones lee could not measure.
 */

function tone(score: number | null): 'success' | 'info' | 'warning' | 'neutral' {
  if (score === null) return 'neutral'
  if (score >= 65) return 'success'
  if (score >= 45) return 'info'
  return 'warning'
}

function SignalRow({ s }: { s: GrowthSignal }) {
  const known = s.score !== null
  return (
    <li className="space-y-0.5 py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium">{GROWTH_LABELS[s.kind]}</span>
        <span className={cn('shrink-0 tabular-nums', known ? 'font-medium' : 'text-muted-foreground')}>{known ? s.score : 'unknown'}</span>
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{s.detail}</p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {s.source}
        {s.date ? ` · ${s.date}` : ''}
        {known ? ` · ${s.confidence} confidence · weight ${GROWTH_WEIGHTS[s.kind]}` : ''}
        {s.url ? (
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2">
            source
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </p>
    </li>
  )
}

export function GrowthWhy({ g }: { g: CompanyGrowthCard }) {
  const known = g.signals.filter((s) => s.score !== null)
  const unknown = g.signals.filter((s) => s.score === null)
  return (
    <div className="space-y-2" data-testid="growth-why">
      <div>
        <p className="text-sm font-semibold">{growthChipText(g.score, g.confidence)}</p>
        <p className="text-xs text-muted-foreground">
          The weighted mean of the signals lee could measure. Unknown signals lower the confidence, never the score. Fame (press volume, stars, a Wikidata entry) is not a signal.
        </p>
      </div>
      {known.length > 0 ? (
        <ul className="divide-y" aria-label="Measured growth signals">
          {known.map((s) => (
            <SignalRow key={s.kind} s={s} />
          ))}
        </ul>
      ) : null}
      {unknown.length > 0 ? (
        <div>
          <p className="text-xs font-medium">Not measured yet</p>
          <ul className="divide-y" aria-label="Growth signals not measured yet">
            {unknown.map((s) => (
              <SignalRow key={s.kind} s={s} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function GrowthChip({ g }: { g: CompanyGrowthCard }) {
  const text = growthChipText(g.score, g.confidence)
  return (
    <ResponsivePopover
      title="Why this growth score"
      trigger={
        <button type="button" aria-label={`${text}. Why`} className={cn('rounded-md', focusRing)} data-testid="growth-chip">
          <span className={cn(badgeVariants({ variant: tone(g.score) }), 'gap-1 font-normal tabular-nums')}>
            <TrendingUp className="size-3" aria-hidden="true" />
            {text}
            <Info className="size-3" aria-hidden="true" />
          </span>
        </button>
      }
    >
      <GrowthWhy g={g} />
    </ResponsivePopover>
  )
}
