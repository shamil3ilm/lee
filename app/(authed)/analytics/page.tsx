import { requireUserId } from '@/lib/auth/require-session'
import { PageHeader } from '@/components/page-header'
import {
  aiUsageStats,
  discoveryCalibration,
  responseTimeDistribution,
  sourceFunnel,
  statusDistribution,
  timeToOutcome,
  weeklyActivity,
} from '@/lib/analytics/service'
import { SourceFunnelCard } from '@/components/analytics/source-funnel-card'
import { ResponseTimeCard } from '@/components/analytics/response-time-card'
import { TimeToOutcomeCard } from '@/components/analytics/time-to-outcome-card'
import { DiscoveryCalibrationCard } from '@/components/analytics/discovery-calibration-card'
import { WeeklyActivityCard } from '@/components/analytics/weekly-activity-card'
import { StatusDistributionCard } from '@/components/analytics/status-distribution-card'
import { AIUsageCard } from '@/components/analytics/ai-usage-card'

export const dynamic = 'force-dynamic'

/**
 * /analytics — seven insight cards mounted from server-computed aggregates.
 * All queries run in parallel via Promise.all so the page is bounded by
 * the slowest query, not their sum.
 */
export default async function AnalyticsPage() {
  const userId = await requireUserId()

  const [funnel, response, outcome, calibration, weekly, status, aiUsage] = await Promise.all([
    sourceFunnel(userId),
    responseTimeDistribution(userId),
    timeToOutcome(userId),
    discoveryCalibration(userId),
    weeklyActivity(userId, 12),
    statusDistribution(userId),
    aiUsageStats(userId, 30),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Turn tracked pipeline data into insight — funnels, timings, calibration, and cadence."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SourceFunnelCard data={funnel} />
        <ResponseTimeCard data={response} />
        <TimeToOutcomeCard data={outcome} />
        <DiscoveryCalibrationCard data={calibration} />
        <WeeklyActivityCard data={weekly} />
        <StatusDistributionCard data={status} />
        <AIUsageCard data={aiUsage} className="xl:col-span-3" />
      </div>
    </div>
  )
}
