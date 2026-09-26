'use client'
import { Store } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { VendorRow } from '@/lib/analytics/service'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface TopVendorsCardProps {
  data: VendorRow[]
}

const CONFIG: ChartConfig = {
  totalCents: { label: 'Spend', color: 'hsl(258 90% 66%)' },
}

/**
 * Horizontal bar chart of the top 10 vendors by spend over the last 3
 * months. Vendor names are compared case-insensitively upstream so casing
 * variants collapse.
 */
export function TopVendorsCard({ data }: TopVendorsCardProps) {
  const isEmpty = data.length === 0
  const chartData = data.map((r) => ({
    vendor: r.vendor,
    totalCents: r.totalCents,
  }))

  return (
    <AnalyticsCardShell
      title="Top vendors"
      description="Top 10 vendors by total spend over the last 3 months. Casing variants (e.g. Netflix vs netflix) are merged."
      exportMetric="top-vendors"
      isEmpty={isEmpty}
      emptyMessage="Add a vendor to your expenses to see who you spend with most."
      emptyIcon={Store}
    >
      <ChartContainer config={CONFIG} className="h-full w-full">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatMoneyAxis(v)}
          />
          <YAxis
            type="category"
            dataKey="vendor"
            tickLine={false}
            axisLine={false}
            width={90}
            fontSize={11}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                valueFormatter={(v) => formatMoney(Number(v))}
              />
            }
          />
          <Bar dataKey="totalCents" fill="var(--color-totalCents)" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
