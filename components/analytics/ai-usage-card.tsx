'use client'
import Link from 'next/link'
import { Bot, Download, HelpCircle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AIUsageStats } from '@/lib/analytics/service'

interface AIUsageCardProps {
  data: AIUsageStats
  className?: string
}

const CHART_CONFIG: ChartConfig = {
  cost: { label: 'Est. cost ($)', color: 'hsl(217 91% 60%)' },
}

function formatCost(v: number): string {
  if (v === 0) return '$0.00'
  if (v < 0.01) return '<$0.01'
  return `$${v.toFixed(v < 1 ? 4 : 2)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
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
                  {formatNumber(data.totalCalls)}
                </span>{' '}
                calls
              </span>
              <span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatCost(data.totalEstimatedCostUsd)}
                </span>{' '}
                estimated cost
              </span>
              <span>
                <span className="tabular-nums text-foreground">
                  {formatNumber(data.totalPromptTokens + data.totalCompletionTokens)}
                </span>{' '}
                tokens
              </span>
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
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
            <Bot className="size-6 text-muted-foreground" />
            <p className="max-w-[240px] text-xs text-muted-foreground">
              Trigger AI-powered features (URL parsing, tailored CVs, discovery
              scoring) to build up cost data here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Provider</th>
                    <th className="px-3 py-2 font-semibold">Kind</th>
                    <th className="px-3 py-2 text-right font-semibold">Calls</th>
                    <th className="px-3 py-2 text-right font-semibold">Prompt</th>
                    <th className="px-3 py-2 text-right font-semibold">Completion</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg latency</th>
                    <th className="px-3 py-2 text-right font-semibold">Est. cost</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Daily cost trend (last 30 days)
              </div>
              <div className="h-32 w-full">
                <ChartContainer config={CHART_CONFIG} className="h-full w-full">
                  <BarChart
                    data={data.byDay.map((b) => ({ ...b, label: shortDayLabel(b.date) }))}
                    margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={6}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v: number) => (v === 0 ? '$0' : `$${v.toFixed(2)}`)}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          valueFormatter={(v) => formatCost(Number(v))}
                        />
                      }
                    />
                    <Bar dataKey="cost" fill="var(--color-cost)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
