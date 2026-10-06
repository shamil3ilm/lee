'use client'
import { CHART_MUTED, CHART_PRIMARY } from '@/lib/ui/chart-palette'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { CATEGORY_AXIS, CHART_MARGIN_LABELLED, VALUE_AXIS } from '@/components/ui/chart-defaults'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

const CONFIG: ChartConfig = {
  previous: { label: 'Previous month', color: CHART_MUTED },
  current: { label: 'Current month', color: CHART_PRIMARY },
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
      <BarChart data={data} margin={CHART_MARGIN_LABELLED}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="category" {...CATEGORY_AXIS} />
        <YAxis {...VALUE_AXIS} tickFormatter={(v: number) => formatMoneyAxis(v)} />
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
