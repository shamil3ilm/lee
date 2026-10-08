'use client'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { CATEGORY_Y_AXIS, CHART_MARGIN, LEGEND_PROPS, VALUE_AXIS } from '@/components/ui/chart-defaults'
import { categorical } from '@/lib/ui/chart-palette'
import { CRITERIA, CRITERION_LABELS, type Criterion } from '@/lib/compare/types'

/**
 * Criteria bar chart: the current job vs one or more opportunities, 0–100.
 * An unknown score draws no bar (never a zero bar); the table next to the
 * chart says "Unknown" in words.
 */

export interface ChartSeries {
  key: string
  label: string
  scores: Readonly<Record<Criterion, number | null>>
}

export function CriteriaChart({ series, className }: { series: readonly ChartSeries[]; className?: string }) {
  // The current job is always the muted slate series; jobs take the brand colours in order.
  const jobIndex = (i: number): number => series.slice(0, i).filter((s) => s.key !== 'current').length
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [`s${i}`, { label: s.label, color: s.key === 'current' ? categorical(6) : categorical(jobIndex(i)) }]),
  )
  const data = CRITERIA.map((c) => ({
    criterion: CRITERION_LABELS[c],
    ...Object.fromEntries(series.map((s, i) => [`s${i}`, s.scores[c]])),
  }))
  return (
    <div className={className ?? 'h-72 w-full'} role="img" aria-label="Criteria scores, 0 to 100, per job">
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} layout="vertical" margin={CHART_MARGIN} barCategoryGap="20%">
          <CartesianGrid horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={VALUE_AXIS.fontSize} />
          <YAxis dataKey="criterion" {...CATEGORY_Y_AXIS} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend {...LEGEND_PROPS} content={<ChartLegendContent />} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={`s${i}`} fill={`var(--color-s${i})`} radius={[0, 2, 2, 0]} />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}
