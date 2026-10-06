'use client'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { CHART_TICK_FONT_SIZE, truncateLabel } from '@/components/ui/chart-defaults'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'

const CONFIG: ChartConfig = {
  level: { label: 'Average level', color: CHART_PRIMARY },
}

export interface RadarDatum {
  domain: string
  level: number
}

/** Average level per domain (0–5). The list beside it carries the same numbers as text. */
export function SkillRadar({ data }: { data: RadarDatum[] }) {
  const chartData = data.map((d) => ({ ...d, short: truncateLabel(d.domain, 12) }))
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <RadarChart data={chartData} outerRadius="70%" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <PolarGrid />
        <PolarAngleAxis dataKey="short" tick={{ fontSize: CHART_TICK_FONT_SIZE - 1 }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Radar dataKey="level" stroke="var(--color-level)" fill="var(--color-level)" fillOpacity={0.25} isAnimationActive={false} />
      </RadarChart>
    </ChartContainer>
  )
}
