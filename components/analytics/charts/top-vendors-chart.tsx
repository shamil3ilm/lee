'use client'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

const CONFIG: ChartConfig = {
  totalCents: { label: 'Spend', color: CHART_PRIMARY },
}

export interface TopVendorDatum {
  vendor: string
  totalCents: number
}

export function TopVendorsChart({ data }: { data: TopVendorDatum[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
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
          content={<ChartTooltipContent valueFormatter={(v) => formatMoney(Number(v))} />}
        />
        <Bar dataKey="totalCents" fill="var(--color-totalCents)" radius={[0, 2, 2, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
