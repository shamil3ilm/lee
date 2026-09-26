'use client'
import dynamic from 'next/dynamic'
import { Cpu } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { AiUsageBreakdown, AiUsageCounts } from '@/lib/analytics/ai-usage-breakdown'
import type { QuotaStatus } from '@/lib/ai/quota-compute'
import { AiQuotaMeters } from './ai-quota-meters'
import { formatCost, formatNumber } from './ai-usage-format'
import { ChartSkeleton } from './charts/chart-skeleton'

const DailyTokensChart = dynamic(
  () => import('./charts/ai-usage-charts').then((m) => m.DailyTokensChart),
  { ssr: false, loading: ChartSkeleton },
)

interface AITokensCardProps {
  data: AiUsageBreakdown
  meters: QuotaStatus[]
  /** From the existing price table; free tier is $0. */
  estimatedCostUsd: number
  className?: string
}

function shortDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <span>
      <span className={cn('text-lg font-semibold tabular-nums text-foreground', tone)}>{value}</span>{' '}
      {label}
    </span>
  )
}

function BreakdownTable<T extends AiUsageCounts>({
  title,
  rows,
  label,
  rowKey,
}: {
  title: string
  rows: T[]
  label: (r: T) => React.ReactNode
  rowKey: (r: T) => string
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 text-right font-semibold">Input</th>
                <th className="px-3 py-2 text-right font-semibold">Output</th>
                <th className="px-3 py-2 text-right font-semibold">Calls</th>
                <th className="px-3 py-2 text-right font-semibold">Errors</th>
                <th className="px-3 py-2 text-right font-semibold">429s</th>
                <th className="px-3 py-2 text-right font-semibold">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rowKey(r)} className="border-t">
                  <td className="px-3 py-1.5 font-medium">{label(r)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(r.inputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(r.outputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatNumber(r.calls)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 text-right tabular-nums',
                      r.errors > 0 ? 'text-rose-500' : 'text-muted-foreground',
                    )}
                  >
                    {formatNumber(r.errors)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 text-right tabular-nums',
                      r.rateLimited > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                    )}
                  >
                    {formatNumber(r.rateLimited)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatNumber(r.avgLatencyMs)}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * v18 — AI tokens & quotas. Tokens first (by day, model and feature),
 * then calls / errors / 429s / latency, today's quota meters, and USD last
 * as an estimate (free tier = $0).
 */
export function AITokensCard({ data, meters, estimatedCostUsd, className }: AITokensCardProps) {
  const t = data.totals
  const isEmpty = t.calls === 0

  return (
    <Card className={cn('flex flex-col md:col-span-2', className)}>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-semibold">AI tokens & quotas</CardTitle>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Stat value={formatNumber(t.inputTokens)} label="input tokens" />
          <Stat value={formatNumber(t.outputTokens)} label="output tokens" />
          <Stat value={formatNumber(t.calls)} label="calls" />
          <Stat value={formatNumber(t.errors)} label="errors" tone={t.errors > 0 ? 'text-rose-500' : undefined} />
          <Stat
            value={formatNumber(t.rateLimited)}
            label="429s"
            tone={t.rateLimited > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
          />
          <Stat value={`${formatNumber(t.avgLatencyMs)}ms`} label="avg latency" />
          <span>
            <span className="tabular-nums text-foreground">{formatCost(estimatedCostUsd)}</span>{' '}
            estimated; free tier = $0
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 pt-0">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quota today (warn at 70%, critical at 90%)
          </div>
          <AiQuotaMeters meters={meters} />
        </div>

        {isEmpty ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
            <Cpu className="size-5 text-muted-foreground" />
            <p className="max-w-[260px] text-xs text-muted-foreground">
              No AI calls in the last {data.days} days.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tokens per day (last {data.days} days)
              </div>
              <div className="h-36 w-full">
                <DailyTokensChart
                  data={data.byDay.map((d) => ({
                    label: shortDayLabel(d.date),
                    inputTokens: d.inputTokens,
                    outputTokens: d.outputTokens,
                  }))}
                />
              </div>
            </div>
            <BreakdownTable
              title="By model"
              rows={data.byModel}
              rowKey={(r) => `${r.provider}:${r.model ?? ''}`}
              label={(r) => (
                <>
                  {r.model ?? 'default model'}{' '}
                  <span className="text-[10px] font-normal text-muted-foreground">{r.provider}</span>
                </>
              )}
            />
            <BreakdownTable
              title="By feature"
              rows={data.byFeature}
              rowKey={(r) => r.kind}
              label={(r) => r.kind}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
