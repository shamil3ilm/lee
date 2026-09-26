'use client'
import { categorical } from '@/lib/ui/chart-palette'
import { DISPLAY_LOCALE } from '@/lib/ui/date'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { HistoryPoint } from './client'

const config: ChartConfig = {
  total: { label: 'Total', color: categorical(0) },
  ats: { label: 'ATS', color: categorical(1) },
  impact: { label: 'Impact', color: categorical(4) },
}

/** Score history (oldest → newest) for the current CV / application. */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {points.length === 1 ? 'Score again after editing to see a trend.' : 'No history yet.'}
      </p>
    )
  }
  const data = points.map((p, i) => ({
    run: `#${i + 1}`,
    label: new Date(p.createdAt).toLocaleDateString(DISPLAY_LOCALE),
    total: p.scores.total ?? p.overall,
    ats: p.scores.ats ?? null,
    impact: p.scores.impact ?? null,
  }))
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="run" tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} dot />
        <Line type="monotone" dataKey="ats" stroke="var(--color-ats)" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="impact" stroke="var(--color-impact)" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ChartContainer>
  )
}
