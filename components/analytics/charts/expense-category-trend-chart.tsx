'use client'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface ExpenseCategoryTrendChartProps {
  config: ChartConfig
  categories: string[]
  data: Record<string, string | number>[]
}

export function ExpenseCategoryTrendChart({ config, categories, data }: ExpenseCategoryTrendChartProps) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
          content={<ChartTooltipContent valueFormatter={(v) => formatMoney(Number(v))} />}
        />
        {categories.map((c) => (
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
  )
}
