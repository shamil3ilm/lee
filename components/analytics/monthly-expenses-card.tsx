'use client'
import { Wallet } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { MonthlyExpenseBar } from '@/lib/analytics/service'
import { colourFor, formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface MonthlyExpensesCardProps {
  data: MonthlyExpenseBar[]
}

function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

/**
 * Stacked bar chart of monthly expense totals over the recent window. Each
 * segment is a category colour; empty months still render (as a zero bar)
 * to keep the X axis continuous. Tooltip lists the top categories per bar.
 */
export function MonthlyExpensesCard({ data }: MonthlyExpensesCardProps) {
  const totalCents = data.reduce((s, b) => s + b.totalCents, 0)
  const isEmpty = totalCents === 0

  // Collect every category that appears in the window so we can render one
  // <Bar> per category. Ordering is by grand total desc so the largest
  // segments sit at the bottom (recharts stacks in DOM order).
  const grandTotals = new Map<string, number>()
  for (const bar of data) {
    for (const c of bar.perCategory) {
      grandTotals.set(c.category, (grandTotals.get(c.category) ?? 0) + c.totalCents)
    }
  }
  const categories = Array.from(grandTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)

  const config: ChartConfig = {}
  for (const c of categories) {
    config[c] = { label: c, color: colourFor(c) }
  }

  const enriched = data.map((bar) => {
    const row: Record<string, string | number> = {
      month: shortMonthLabel(bar.month),
    }
    for (const c of categories) {
      const seg = bar.perCategory.find((p) => p.category === c)
      row[c] = seg ? seg.totalCents : 0
    }
    return row
  })

  return (
    <AnalyticsCardShell
      title="Monthly expenses"
      description="Total expense spend per month over the last 6 months, stacked by category."
      exportMetric="monthly-expenses"
      isEmpty={isEmpty}
      emptyMessage="Log expenses to see your monthly cadence and spending mix."
      emptyIcon={Wallet}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={enriched} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
          {categories.map((c) => (
            <Bar
              key={c}
              dataKey={c}
              stackId="expenses"
              fill={`var(--color-${c})`}
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
