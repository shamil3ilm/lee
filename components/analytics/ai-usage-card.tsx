'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Bot, Download, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AIUsageStats } from '@/lib/analytics/service'
import { formatCost, formatNumber } from './ai-usage-format'
import { ChartSkeleton } from './charts/chart-skeleton'

interface AIUsageCardProps {
  data: AIUsageStats
  className?: string
}

// recharts loads lazily; each chart sits in a fixed-height box, so no layout shift.
const SignalCheckChart = dynamic(
  () => import('./charts/ai-usage-charts').then((m) => m.SignalCheckChart),
  { ssr: false, loading: ChartSkeleton },
)

const DailyCostChart = dynamic(
  () => import('./charts/ai-usage-charts').then((m) => m.DailyCostChart),
  { ssr: false, loading: ChartSkeleton },
)

function formatPct(v: number): string {
  return `${(v * 100).toFixed(v < 0.01 ? 1 : 0)}%`
}

function formatRating(v: number | null): string {
  return v == null ? '—' : v.toFixed(2)
}

function shortDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * AI usage & cost card. Header shows total-calls + total-cost over the last
 * 30 days; the body is a per-(provider, kind) breakdown table, and a small
 * daily-cost trend bar chart sits at the bottom so the reader can spot
 * spikes at a glance.
 *
 * Cost is estimated from a hardcoded per-provider price table in the
 * service — we log provider/kind but not model, so pricing uses each
 * provider's default model as a proxy. Free-tier providers show $0.
 */
export function AIUsageCard({ data, className }: AIUsageCardProps) {
  const isEmpty = data.totalCalls === 0

  return (
    <Card className={cn('flex flex-col md:col-span-2', className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">AI usage & cost</CardTitle>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="About AI usage"
                  >
                    <HelpCircle className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs">
                  Calls, tokens, latency and estimated USD cost of AI usage over the
                  last 30 days. Cost uses a hardcoded per-provider price table and
                  provider defaults for model; free-tier providers show $0.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {!isEmpty ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatNumber(data.totalPromptTokens + data.totalCompletionTokens)}
                </span>{' '}
                tokens
              </span>
              <span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatNumber(data.totalCalls)}
                </span>{' '}
                calls
              </span>
              <span>
                <span className="tabular-nums text-foreground">
                  {formatCost(data.totalEstimatedCostUsd)}
                </span>{' '}
                estimated; free tier = $0
              </span>
              <span>
                <span
                  className={cn(
                    'tabular-nums text-foreground',
                    data.signalSkipRate > 0.25 && 'text-danger',
                  )}
                >
                  {formatPct(data.signalSkipRate)}
                </span>{' '}
                skipped
              </span>
              {data.ratingAvg != null ? (
                <span>
                  <span className="tabular-nums text-foreground">
                    {formatRating(data.ratingAvg)}
                  </span>{' '}
                  avg rating
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Link
            href="/api/analytics/export/ai-usage"
            aria-label="Export AI usage as CSV"
            prefetch={false}
          >
            <Download className="size-3.5" />
            CSV
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 pt-0">
        {isEmpty ? (
          <EmptyState
            size="sm"
            className="h-56"
            icon={Bot}
            title="No AI usage yet"
            description="Trigger AI-powered features (URL parsing, tailored CVs, discovery scoring) to build up cost data here."
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              {/*
                7 columns won't fit at 390-768px viewport widths — wrap in a
                horizontal scroller with a min-width so columns stay readable.
              */}
              <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Provider</th>
                    <th className="px-3 py-2 font-semibold">Kind</th>
                    <th className="px-3 py-2 text-right font-semibold">Calls</th>
                    <th className="px-3 py-2 text-right font-semibold">Prompt</th>
                    <th className="px-3 py-2 text-right font-semibold">Completion</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg latency</th>
                    <th className="px-3 py-2 text-right font-semibold">Est. cost</th>
                    <th className="px-3 py-2 text-right font-semibold">Skip %</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={`${r.provider}:${r.kind}`} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{r.provider}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.kind}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatNumber(r.calls)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatNumber(r.promptTokens)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatNumber(r.completionTokens)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatNumber(r.avgLatencyMs)}ms
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatCost(r.estimatedCostUsd)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-1.5 text-right tabular-nums',
                          r.skipRate > 0.25 ? 'text-danger' : 'text-muted-foreground',
                        )}
                      >
                        {formatPct(r.skipRate)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatRating(r.ratingAvg)}
                        {r.ratingCount > 0 ? (
                          <span className="ml-1 text-[10px] opacity-60">
                            ({r.ratingCount})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {data.byPromptVersion.length > 0 ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Prompt versions (last 30 days)
                </div>
                <div className="overflow-hidden rounded-md border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="bg-muted/40">
                        <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">Kind</th>
                          <th className="px-3 py-2 font-semibold">Version</th>
                          <th className="px-3 py-2 text-right font-semibold">Calls</th>
                          <th className="px-3 py-2 text-right font-semibold">Avg rating</th>
                          <th className="px-3 py-2 text-right font-semibold">Avg latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byPromptVersion.map((r) => {
                          // v10.1 — versions performing below 3.0 average
                          // rating are flagged so a bad prompt bump is
                          // visible without opening the raw rating log.
                          const isPoor = r.ratingAvg != null && r.ratingAvg < 3.0
                          return (
                            <tr
                              key={`${r.kind}:${r.promptVersion}`}
                              className={cn(
                                'border-t',
                                isPoor && 'bg-warning/10',
                              )}
                            >
                              <td className="px-3 py-1.5 font-medium">{r.kind}</td>
                              <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                                {r.promptVersion}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {formatNumber(r.calls)}
                              </td>
                              <td
                                className={cn(
                                  'px-3 py-1.5 text-right tabular-nums',
                                  isPoor
                                    ? 'text-warning font-medium'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {formatRating(r.ratingAvg)}
                                {r.ratingCount > 0 ? (
                                  <span className="ml-1 text-[10px] opacity-60">
                                    ({r.ratingCount})
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                {formatNumber(r.avgLatencyMs)}ms
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {data.signalCheckByKind.some((b) => b.skipped > 0) ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Signal checks — proceeded vs skipped (last 30 days)
                </div>
                <div className="h-40 w-full">
                  <SignalCheckChart data={data.signalCheckByKind} />
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Daily cost trend (last 30 days)
              </div>
              <div className="h-32 w-full">
                <DailyCostChart data={data.byDay.map((b) => ({ ...b, label: shortDayLabel(b.date) }))} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
