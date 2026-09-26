'use client'
import dynamic from 'next/dynamic'
import { Clock } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { ResponseTimeBucket } from '@/lib/analytics/service'

interface ResponseTimeCardProps {
  data: ResponseTimeBucket[]
}

const ResponseTimeChart = dynamic(
  () => import('./charts/response-time-chart').then((m) => m.ResponseTimeChart),
  { ssr: false, loading: ChartSkeleton },
)

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
      <ResponseTimeChart data={data} />
    </AnalyticsCardShell>
  )
}
