'use client'
import { AlertTriangle, Gauge } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { QuotaDimension, QuotaLevel, QuotaStatus } from '@/lib/ai/quota-compute'
import { QUOTA_CRITICAL, QUOTA_WARN } from '@/lib/ai/quota-limits'
import { formatNumber } from './ai-usage-format'

const DIMENSION_LABEL: Record<QuotaDimension['key'], string> = {
  requests_day: 'Requests / day',
  tokens_day: 'Tokens / day',
  requests_minute: 'Requests / min',
  tokens_minute: 'Tokens / min',
  audio_seconds_hour: 'Audio sec / hour',
  audio_seconds_day: 'Audio sec / day',
}

const LEVEL_BADGE: Record<
  QuotaLevel,
  { label: string; variant: 'success' | 'outline' | 'danger' | 'neutral'; className?: string }
> = {
  ok: { label: 'OK', variant: 'success' },
  warn: {
    label: '≥70%',
    variant: 'outline',
    className: 'border-warning text-warning',
  },
  critical: { label: '≥90%', variant: 'danger' },
  exhausted: { label: 'Limit hit', variant: 'danger' },
  unknown: { label: 'Unknown', variant: 'neutral' },
}

function barTone(fraction: number): string {
  if (fraction >= QUOTA_CRITICAL) return 'bg-danger'
  if (fraction >= QUOTA_WARN) return 'bg-warning'
  return 'bg-success'
}

function Meter({ d }: { d: QuotaDimension }) {
  const pct = Math.min(100, Math.round(d.fraction * 100))
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          {DIMENSION_LABEL[d.key]}
          {d.approximate ? <span className="ml-1 opacity-70">(approx.)</span> : null}
        </span>
        <span className="tabular-nums">
          {formatNumber(Math.round(d.used))} / {formatNumber(d.limit)}{' '}
          <span className="text-muted-foreground">
            · {pct}% · {d.source === 'provider' ? 'provider' : 'estimated'}
          </span>
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={DIMENSION_LABEL[d.key]}
        aria-valuemin={0}
        aria-valuemax={d.limit}
        aria-valuenow={Math.round(d.used)}
      >
        <div className={cn('h-full rounded-full', barTone(d.fraction))} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

interface AiQuotaMetersProps {
  meters: QuotaStatus[]
}

/**
 * Today's usage against free-tier limits per provider/model. Provider
 * snapshots (Groq x-ratelimit-* headers) win while their window is open;
 * everything else is counted from ai_call_logs against published limits.
 */
export function AiQuotaMeters({ meters }: AiQuotaMetersProps) {
  if (meters.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <Gauge className="size-4" />
        No AI calls today — quota meters appear after the first call.
      </div>
    )
  }
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-3 md:grid-cols-2">
        {meters.map((m) => {
          const badge = LEVEL_BADGE[m.level]
          return (
            <div key={`${m.provider}:${m.model}`} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{m.model}</div>
                  <div className="text-[10px] text-muted-foreground">{m.provider}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {m.level === 'warn' || m.level === 'critical' || m.level === 'exhausted' ? (
                    <AlertTriangle
                      className={cn(
                        'size-3.5',
                        m.level === 'warn' ? 'text-warning' : 'text-danger',
                      )}
                      aria-hidden
                    />
                  ) : null}
                  <Badge variant={badge.variant} className={cn('text-[10px]', badge.className)}>
                    {badge.label}
                  </Badge>
                </div>
              </div>
              {m.dimensions.map((d) => (
                <Meter key={d.key} d={d} />
              ))}
              <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                {m.retryAfterAt ? (
                  <span>Rate limited until {new Date(m.retryAfterAt).toLocaleTimeString()}</span>
                ) : null}
                {m.observedAt ? (
                  <span>Provider snapshot {new Date(m.observedAt).toLocaleTimeString()}</span>
                ) : null}
                {m.limitSource ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={m.limitSource}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {m.approximate ? 'Approximate limits' : 'Published limits'}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px] text-xs">
                      Free-tier limits last verified {m.lastVerified}.
                      {m.approximate
                        ? ' The provider no longer publishes exact per-model numbers — check your console.'
                        : ''}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
