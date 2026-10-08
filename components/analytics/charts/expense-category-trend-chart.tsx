'use client'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { CHART_MARGIN, LEGEND_PROPS, TIME_AXIS, VALUE_AXIS, lineProps } from '@/components/ui/chart-defaults'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface ExpenseCategoryTrendChartProps {
  config: ChartConfig
  categories: string[]
  data: Record<string, string | number>[]
}

export function ExpenseCategoryTrendChart({ config, categories, data }: ExpenseCategoryTrendChartProps) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" {...TIME_AXIS} />
        <YAxis {...VALUE_AXIS} tickFormatter={(v: number) => formatMoneyAxis(v)} />
        <ChartTooltip
          content={<ChartTooltipContent valueFormatter={(v) => formatMoney(Number(v))} />}
        />
        <ChartLegend {...LEGEND_PROPS} content={<ChartLegendContent />} />
        {categories.map((c) => (
          <Line key={c} dataKey={c} stroke={`var(--color-${c})`} fill={`var(--color-${c})`} {...lineProps(data.length)} />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
