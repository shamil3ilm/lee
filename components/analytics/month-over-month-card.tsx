'use client'
import { TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { MonthComparisonRow } from '@/lib/analytics/service'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface MonthOverMonthCardProps {
  data: MonthComparisonRow[]
}

const CONFIG: ChartConfig = {
  previous: { label: 'Previous month', color: 'hsl(215 20% 55%)' },
  current: { label: 'Current month', color: 'hsl(217 91% 60%)' },
}

/**
 * Grouped bar chart comparing per-category spend against the previous month.
 * Top 6 categories by absolute delta so the chart stays legible even when
 * the user has 20+ categories. Delta % is rendered as a label above the
 * current-month bar.
 */
export function MonthOverMonthCard({ data }: MonthOverMonthCardProps) {
  const isEmpty =
    data.length === 0 ||
    data.every((r) => r.currentCents === 0 && r.previousCents === 0)

  const top = data.slice(0, 6).map((r) => ({
    category: r.category,
    current: r.currentCents,
    previous: r.previousCents,
    deltaLabel:
      r.deltaPercent === null
        ? '—'
        : `${r.deltaPercent > 0 ? '+' : ''}${r.deltaPercent.toFixed(0)}%`,
  }))

  return (
    <AnalyticsCardShell
      title="Month-over-month"
      description="Per-category spend against the previous month. Delta % is labelled above the current-month bar. Top 6 categories by absolute change."
      exportMetric="month-over-month"
      isEmpty={isEmpty}
      emptyMessage="Log expenses across two months to see how spending changes."
      emptyIcon={TrendingUp}
    >
      <ChartContainer config={CONFIG} className="h-full w-full">
        <BarChart data={top} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="category"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={0}
            fontSize={11}
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
          <Bar dataKey="previous" fill="var(--color-previous)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="current" fill="var(--color-current)" radius={[2, 2, 0, 0]}>
            <LabelList
              dataKey="deltaLabel"
              position="top"
              fontSize={10}
              className="fill-muted-foreground"
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
