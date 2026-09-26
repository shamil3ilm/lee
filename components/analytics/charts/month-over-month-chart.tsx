'use client'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

const CONFIG: ChartConfig = {
  previous: { label: 'Previous month', color: 'hsl(215 20% 55%)' },
  current: { label: 'Current month', color: 'hsl(217 91% 60%)' },
}

export interface MonthOverMonthDatum {
  category: string
  current: number
  previous: number
  deltaLabel: string
}

export function MonthOverMonthChart({ data }: { data: MonthOverMonthDatum[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <BarChart data={data} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
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
          content={<ChartTooltipContent valueFormatter={(v) => formatMoney(Number(v))} />}
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
  )
}
