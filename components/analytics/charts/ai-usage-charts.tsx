'use client'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { AIUsageStats } from '@/lib/analytics/service'
import { formatCost, formatNumber } from '../ai-usage-format'

const CHART_CONFIG: ChartConfig = {
  cost: { label: 'Est. cost ($)', color: 'hsl(217 91% 60%)' },
}

const SIGNAL_CHART_CONFIG: ChartConfig = {
  proceeded: { label: 'Proceeded', color: 'hsl(142 71% 45%)' },
  skipped: { label: 'Skipped', color: 'hsl(0 84% 60%)' },
}

export function SignalCheckChart({ data }: { data: AIUsageStats['signalCheckByKind'] }) {
  return (
    <ChartContainer config={SIGNAL_CHART_CONFIG} className="h-full w-full">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="kind"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval={0}
          angle={-30}
          height={70}
          textAnchor="end"
          fontSize={10}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={30}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="proceeded" stackId="s" fill="var(--color-proceeded)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="skipped" stackId="s" fill="var(--color-skipped)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

export type DailyCostDatum = AIUsageStats['byDay'][number] & { label: string }

export function DailyCostChart({ data }: { data: DailyCostDatum[] }) {
  return (
    <ChartContainer config={CHART_CONFIG} className="h-full w-full">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => (v === 0 ? '$0' : `$${v.toFixed(2)}`)}
        />
        <ChartTooltip
          content={<ChartTooltipContent valueFormatter={(v) => formatCost(Number(v))} />}
        />
        <Bar dataKey="cost" fill="var(--color-cost)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
