'use client'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { SourceFunnelRow } from '@/lib/analytics/service'

const CONFIG: ChartConfig = {
  applied: { label: 'Applied', color: 'hsl(217 91% 60%)' },
  screened: { label: 'Screened', color: 'hsl(239 84% 67%)' },
  interviewed: { label: 'Interviewed', color: 'hsl(258 90% 66%)' },
  offered: { label: 'Offered', color: 'hsl(142 71% 45%)' },
}

export function SourceFunnelChart({ data }: { data: SourceFunnelRow[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="source" tickLine={false} axisLine={false} tickMargin={6} />
        <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="applied" fill="var(--color-applied)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="screened" fill="var(--color-screened)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="interviewed" fill="var(--color-interviewed)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="offered" fill="var(--color-offered)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
