/**
 * Real-Postgres smoke test (CI job `postgres-smoke`).
 *
 * Unit/integration tests run on PGlite, which is more permissive than the
 * production driver (postgres-js on Neon): e.g. PGlite accepts a JS Date bound
 * in raw sql`` while drizzle's postgres-js setup did not, which broke
 * /analytics and the nightly retention cron in production with every test
 * green. This script exercises the raw-SQL-heavy paths against a real Postgres.
 *
 * Usage: DATABASE_URL=postgres://… pnpm db:migrate && pnpm tsx scripts/pg-smoke.ts
 */
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'
import * as analytics from '@/lib/analytics/service'
import { aiUsageBreakdown } from '@/lib/analytics/ai-usage-breakdown'
import { quotaMeters } from '@/lib/ai/quota'
import { runRetention } from '@/lib/db/retention'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { drain } from '@/lib/queue/drain'
import { recordDueReminders } from '@/lib/reminders/service'
import { takeUsageSnapshot } from '@/lib/usage/snapshot'

type Check = readonly [name: string, run: () => Promise<unknown>]

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : ''
  return `${error.message.split('\n')[0]}${cause}`
}

async function main(): Promise<void> {
  if (process.env.DATABASE_URL?.startsWith('pglite:') !== false) {
    throw new Error('pg-smoke needs DATABASE_URL pointing at a real Postgres')
  }
  const user = await makeUser()
  const company = await makeCompany(user.id)
  const job = await makeJob(user.id, company.id)
  await makeApplication(user.id, job.id, { status: 'applied' })
  const id = user.id
  const now = new Date()

  const checks: readonly Check[] = [
    ['analytics.sourceFunnel', () => analytics.sourceFunnel(id)],
    ['analytics.responseTimeDistribution', () => analytics.responseTimeDistribution(id)],
    ['analytics.timeToOutcome', () => analytics.timeToOutcome(id)],
    ['analytics.discoveryCalibration', () => analytics.discoveryCalibration(id)],
    ['analytics.weeklyActivity', () => analytics.weeklyActivity(id, 12)],
    ['analytics.statusDistribution', () => analytics.statusDistribution(id)],
    ['analytics.aiUsageStats', () => analytics.aiUsageStats(id, 30)],
    ['analytics.monthlyExpenses', () => analytics.monthlyExpenses(id, 6)],
    ['analytics.budgetVsActual', () => analytics.budgetVsActual(id)],
    ['analytics.expenseCategoryTrend', () => analytics.expenseCategoryTrend(id, 6)],
    ['analytics.topVendors', () => analytics.topVendors(id, 3)],
    ['analytics.budgetAdherenceHistory', () => analytics.budgetAdherenceHistory(id, 6)],
    ['aiUsageBreakdown', () => aiUsageBreakdown(id, 30)],
    ['quotaMeters', () => quotaMeters(id, now)],
    ['runRetention', () => runRetention(now, { budgetMs: 20_000 })],
    ['scheduleDailyJobs', () => scheduleDailyJobs(now)],
    ['recordDueReminders', () => recordDueReminders(now)],
    ['drain', () => drain({ budgetMs: 20_000 })],
    ['takeUsageSnapshot', () => takeUsageSnapshot(now)],
  ]

  const failures: string[] = []
  for (const [name, run] of checks) {
    try {
      await run()
      process.stdout.write(`ok   ${name}\n`)
    } catch (error: unknown) {
      failures.push(name)
      process.stdout.write(`FAIL ${name}: ${describeError(error)}\n`)
    }
  }
  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} of ${checks.length} checks failed on real Postgres\n`)
    process.exit(1)
  }
  process.stdout.write(`\nall ${checks.length} checks passed on real Postgres\n`)
  process.exit(0)
}

main().catch((error: unknown) => {
  process.stdout.write(`pg-smoke crashed: ${describeError(error)}\n`)
  process.exit(1)
})
