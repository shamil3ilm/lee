'use client'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney, formatMoneyAxis } from '@/lib/ui/money'

interface MonthlyExpensesChartProps {
  config: ChartConfig
  /** Category keys in stack order (largest first, so it sits at the bottom). */
  categories: string[]
  data: Record<string, string | number>[]
}

export function MonthlyExpensesChart({ config, categories, data }: MonthlyExpensesChartProps) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
  )
}
