import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TONE_BG, TONE_TEXT, type SemanticTone } from '@/lib/ui/tones'
import { formatMeterValue, formatPercent } from '@/lib/usage/format'
import type { MeterLevel } from '@/lib/usage/meters'
import type { MeterView } from '@/lib/usage/view-model'

const LEVEL_TONE: Record<MeterLevel, SemanticTone> = {
  ok: 'success',
  warn: 'warning',
  critical: 'danger',
  unknown: 'neutral',
}

const LEVEL_BADGE: Record<MeterLevel, string | null> = {
  ok: null,
  warn: '≥70%',
  critical: '≥90%',
  unknown: null,
}

function MeterLink({ link }: { link: NonNullable<MeterView['link']> }) {
  const external = link.href.startsWith('http')
  const className = 'inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
  return external ? (
    <a href={link.href} target="_blank" rel="noreferrer noopener" className={className}>
      {link.label}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  )
}

function valueLine(m: MeterView): string {
  if (m.used === null) return '—'
  const used = formatMeterValue(m.unit, m.used)
  return m.limit === null ? used : `${used} / ${formatMeterValue(m.unit, m.limit)}`
}

/** One meter: label, value / limit, % used, bar with the projection tick, source. */
export function UsageMeterRow({ meter: m }: { meter: MeterView }) {
  const tone = LEVEL_TONE[m.level]
  const pct = m.fraction === null ? 0 : Math.min(100, m.fraction * 100)
  const projPct = m.projectedFraction === null ? null : Math.min(100, m.projectedFraction * 100)
  const badge = LEVEL_BADGE[m.level]
  return (
    <li className="space-y-1.5 py-3" data-testid={`usage-meter-${m.id}`} data-level={m.level}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium">{m.label}</span>
          {badge ? <Badge variant={tone}>{badge}</Badge> : null}
        </div>
        <div className="text-sm tabular-nums">
          {valueLine(m)}
          {m.fraction !== null ? (
            <span className={cn('ml-2 font-semibold', TONE_TEXT[tone])}>{formatPercent(m.fraction)}</span>
          ) : null}
        </div>
      </div>
      {m.limit !== null ? (
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={m.label}
          aria-valuemin={0}
          aria-valuemax={m.limit}
          aria-valuenow={m.used ?? 0}
          aria-valuetext={m.fraction === null ? 'not measured' : `${formatPercent(m.fraction)} used`}
        >
          <div className={cn('h-full rounded-full', TONE_BG[tone])} style={{ width: `${pct}%` }} />
          {projPct !== null && projPct > pct ? (
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground/50"
              style={{ left: `calc(${projPct}% - 1px)` }}
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span data-testid="usage-source">{m.sourceLabel}</span>
        {m.projected !== null && m.limit !== null ? (
          <span>
            Projected end of month: {formatMeterValue(m.unit, m.projected)}
            {m.projectedFraction !== null ? ` (${formatPercent(m.projectedFraction)})` : ''}
          </span>
        ) : null}
        {m.link ? <MeterLink link={m.link} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {m.help}
        {m.docsUrl && m.group !== 'app' ? (
          <>
            {' '}
            <a href={m.docsUrl} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:underline">
              Limit source
            </a>
            {m.lastVerified ? `, verified ${m.lastVerified}.` : '.'}
          </>
        ) : null}
      </p>
    </li>
  )
}
