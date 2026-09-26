import { requireUserId } from '@/lib/auth/require-session'
import { PageHeader } from '@/components/page-header'
import {
  aiUsageStats,
  budgetAdherenceHistory,
  budgetVsActual,
  discoveryCalibration,
  expenseCategoryTrend,
  monthOverMonthByCategory,
  monthlyExpenses,
  responseTimeDistribution,
  sourceFunnel,
  statusDistribution,
  timeToOutcome,
  topVendors,
  weeklyActivity,
} from '@/lib/analytics/service'
import { SourceFunnelCard } from '@/components/analytics/source-funnel-card'
import { ResponseTimeCard } from '@/components/analytics/response-time-card'
import { TimeToOutcomeCard } from '@/components/analytics/time-to-outcome-card'
import { DiscoveryCalibrationCard } from '@/components/analytics/discovery-calibration-card'
import { WeeklyActivityCard } from '@/components/analytics/weekly-activity-card'
import { StatusDistributionCard } from '@/components/analytics/status-distribution-card'
import { AIUsageCard } from '@/components/analytics/ai-usage-card'
import { MonthlyExpensesCard } from '@/components/analytics/monthly-expenses-card'
import { BudgetVsActualCard } from '@/components/analytics/budget-vs-actual-card'
import { MonthOverMonthCard } from '@/components/analytics/month-over-month-card'
import { ExpenseCategoryTrendCard } from '@/components/analytics/expense-category-trend-card'
import { TopVendorsCard } from '@/components/analytics/top-vendors-card'
import { BudgetAdherenceHistoryCard } from '@/components/analytics/budget-adherence-history-card'

export const dynamic = 'force-dynamic'

/**
 * /analytics — seven insight cards mounted from server-computed aggregates.
 * All queries run in parallel via Promise.all so the page is bounded by
 * the slowest query, not their sum.
 */
function currentAndPrevMonth(): { current: string; previous: string } {
  const now = new Date()
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const previous = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
  return { current, previous }
}

export default async function AnalyticsPage() {
  const userId = await requireUserId()
  const { current, previous } = currentAndPrevMonth()

  const [
    funnel,
    response,
    outcome,
    calibration,
    weekly,
    status,
    aiUsage,
    expensesByMonth,
    budgets,
    momByCategory,
    categoryTrend,
    vendors,
    adherenceHistory,
  ] = await Promise.all([
    sourceFunnel(userId),
    responseTimeDistribution(userId),
    timeToOutcome(userId),
    discoveryCalibration(userId),
    weeklyActivity(userId, 12),
    statusDistribution(userId),
    aiUsageStats(userId, 30),
    monthlyExpenses(userId, 6),
    budgetVsActual(userId),
    monthOverMonthByCategory(userId, current, previous),
    expenseCategoryTrend(userId, 6),
    topVendors(userId, 3, 10),
    budgetAdherenceHistory(userId, 12),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Turn tracked pipeline data into insight — funnels, timings, calibration, and cadence."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SourceFunnelCard data={funnel} />
        <ResponseTimeCard data={response} />
        <TimeToOutcomeCard data={outcome} />
        <DiscoveryCalibrationCard data={calibration} />
        <WeeklyActivityCard data={weekly} />
        <StatusDistributionCard data={status} />
        <MonthlyExpensesCard data={expensesByMonth} />
        <BudgetVsActualCard data={budgets} />
        <MonthOverMonthCard data={momByCategory} />
        <ExpenseCategoryTrendCard data={categoryTrend} />
        <TopVendorsCard data={vendors} />
        <BudgetAdherenceHistoryCard data={adherenceHistory} />
        <AIUsageCard data={aiUsage} className="xl:col-span-3" />
      </div>
    </div>
  )
}
