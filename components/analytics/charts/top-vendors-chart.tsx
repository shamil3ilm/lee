'use client'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { CATEGORY_Y_AXIS, CHART_MARGIN, VALUE_X_AXIS } from '@/components/ui/chart-defaults'
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
      <BarChart data={data} layout="vertical" margin={CHART_MARGIN}>
        <CartesianGrid horizontal={false} />
        <XAxis {...VALUE_X_AXIS} tickFormatter={(v: number) => formatMoneyAxis(v)} />
        <YAxis dataKey="vendor" {...CATEGORY_Y_AXIS} />
        <ChartTooltip
          content={<ChartTooltipContent valueFormatter={(v) => formatMoney(Number(v))} />}
        />
        <Bar dataKey="totalCents" fill="var(--color-totalCents)" radius={[0, 2, 2, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
