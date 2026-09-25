'use client'
import { Clock } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { ResponseTimeBucket } from '@/lib/analytics/service'

interface ResponseTimeCardProps {
  data: ResponseTimeBucket[]
}

const CONFIG: ChartConfig = {
  count: { label: 'Applications', color: 'hsl(217 91% 60%)' },
}

/**
 * Histogram of days-to-first-response across all applied applications.
 * Empty state kicks in when EVERY bucket is zero — a partial distribution
 * (say only the 0-3 bucket populated) is still meaningful and rendered.
 */
export function ResponseTimeCard({ data }: ResponseTimeCardProps) {
  const total = data.reduce((s, b) => s + b.count, 0)
  const isEmpty = total === 0

  return (
    <AnalyticsCardShell
      title="Response time"
      description="Days between an application's applied date and the first inbound signal (email or a status change into anything other than 'saved')."
      exportMetric="response-time"
      isEmpty={isEmpty}
      emptyMessage="Log at least a few applied applications with follow-up activity to see the distribution."
      emptyIcon={Clock}
    >
      <ChartContainer config={CONFIG} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="bucketDays" tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
