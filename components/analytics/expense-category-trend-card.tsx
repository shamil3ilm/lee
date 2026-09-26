'use client'
import { LineChart as LineChartIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { CategoryTrendRow } from '@/lib/analytics/service'
import { colourFor, formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface ExpenseCategoryTrendCardProps {
  data: CategoryTrendRow[]
}

function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

/**
 * Line chart of monthly spend for the top-5 categories over the trailing
 * window. Categories are ranked by aggregate spend across the window so a
 * category with a single big month still surfaces.
 */
export function ExpenseCategoryTrendCard({ data }: ExpenseCategoryTrendCardProps) {
  const isEmpty = data.length === 0

  // Aggregate to pick the top 5 categories in the window.
  const totals = new Map<string, number>()
  const months = new Set<string>()
  for (const r of data) {
    totals.set(r.category, (totals.get(r.category) ?? 0) + r.totalCents)
    months.add(r.month)
  }
  const topCategories = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c)

  const sortedMonths = Array.from(months).sort()
  const rowByMonth = new Map<string, Record<string, string | number>>()
  for (const m of sortedMonths) {
    rowByMonth.set(m, { month: shortMonthLabel(m), _key: m })
  }
  for (const r of data) {
    if (!topCategories.includes(r.category)) continue
    const row = rowByMonth.get(r.month)
    if (row) row[r.category] = r.totalCents
  }
  // Fill 0 for missing (month, category) pairs so the line draws through.
  for (const row of rowByMonth.values()) {
    for (const c of topCategories) {
      if (row[c] === undefined) row[c] = 0
    }
  }
  const chartData = Array.from(rowByMonth.values())

  const config: ChartConfig = {}
  for (const c of topCategories) {
    config[c] = { label: c, color: colourFor(c) }
  }

  return (
    <AnalyticsCardShell
      title="Category trends"
      description="Top-5 expense categories tracked month-over-month for the last 6 months."
      exportMetric="expense-category-trend"
      isEmpty={isEmpty}
      emptyMessage="Log expenses over several months to see category trends."
      emptyIcon={LineChartIcon}
    >
      <ChartContainer config={config} className="h-full w-full">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => formatMoneyAxis(v)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                valueFormatter={(v) => formatMoney(Number(v))}
              />
            }
          />
          {topCategories.map((c) => (
            <Line
              key={c}
              type="monotone"
              dataKey={c}
              stroke={`var(--color-${c})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
