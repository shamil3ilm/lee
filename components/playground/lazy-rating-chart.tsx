'use client'
import dynamic from 'next/dynamic'
import { ChartSkeleton } from '@/components/analytics/charts/chart-skeleton'
import type { RatingPoint } from './rating-chart'

// Recharts loads after the page, as on Analytics, so the skill page's own
// JavaScript stays inside the Playground bundle budget (check:bundle).
const RatingChart = dynamic(() => import('./rating-chart').then((m) => m.RatingChart), {
  ssr: false,
  loading: ChartSkeleton,
})

export function LazyRatingChart({ data }: { data: RatingPoint[] }) {
  return <RatingChart data={data} />
}
