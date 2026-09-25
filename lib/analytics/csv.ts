import {
  aiUsageStats,
  budgetVsActual,
  discoveryCalibration,
  monthlyExpenses,
  responseTimeDistribution,
  sourceFunnel,
  statusDistribution,
  timeToOutcome,
  weeklyActivity,
} from '@/lib/analytics/service'

/**
 * Analytics CSV export. Each metric has its own row shape, so we dispatch
 * to a per-metric function that returns (columns, rows) and then serialise.
 * Keep this file free of Next-request objects so it stays trivially unit
 * testable — the API route composes it.
 */

export const EXPORT_METRICS = [
  'source-funnel',
  'response-time',
  'time-to-outcome',
  'discovery-calibration',
  'weekly-activity',
  'status-distribution',
  'ai-usage',
  'monthly-expenses',
  'budget-vs-actual',
] as const

export type ExportMetric = (typeof EXPORT_METRICS)[number]

export function isExportMetric(value: string): value is ExportMetric {
  return (EXPORT_METRICS as readonly string[]).includes(value)
}

interface CsvTable {
  columns: string[]
  rows: (string | number)[][]
}

/**
 * RFC 4180-ish CSV escaping. Wrap a cell in quotes and double any inner
 * quotes when it contains a comma, quote, newline, or leading/trailing
 * whitespace. Numbers pass through unwrapped so downstream tools (Excel,
 * Sheets) keep them as numeric.
 */
function escapeCell(cell: string | number): string {
  if (typeof cell === 'number') return String(cell)
  const needsQuoting = /[",\n\r]|^\s|\s$/.test(cell)
  const doubled = cell.replace(/"/g, '""')
  return needsQuoting ? `"${doubled}"` : doubled
}

function serialiseCsv(table: CsvTable): string {
  const lines: string[] = []
  lines.push(table.columns.map(escapeCell).join(','))
  for (const row of table.rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

export async function buildCsv(metric: ExportMetric, userId: string): Promise<string> {
  const table = await buildTable(metric, userId)
  return serialiseCsv(table)
}

async function buildTable(metric: ExportMetric, userId: string): Promise<CsvTable> {
  switch (metric) {
    case 'source-funnel': {
      const rows = await sourceFunnel(userId)
      return {
        columns: ['source', 'applied', 'screened', 'interviewed', 'offered', 'rejected'],
        rows: rows.map((r) => [
          r.source,
          r.applied,
          r.screened,
          r.interviewed,
          r.offered,
          r.rejected,
        ]),
      }
    }
    case 'response-time': {
      const rows = await responseTimeDistribution(userId)
      return {
        columns: ['bucket_days', 'count'],
        rows: rows.map((r) => [r.bucketDays, r.count]),
      }
    }
    case 'time-to-outcome': {
      const stats = await timeToOutcome(userId)
      return {
        columns: ['outcome', 'median_days', 'p90_days', 'count'],
        rows: [
          ['offer', stats.offer.median, stats.offer.p90, stats.offer.count],
          ['rejection', stats.rejection.median, stats.rejection.p90, stats.rejection.count],
        ],
      }
    }
    case 'discovery-calibration': {
      const rows = await discoveryCalibration(userId)
      return {
        columns: ['match_score', 'outcome', 'count'],
        rows: rows.map((r) => [r.matchScore, r.outcome, r.count]),
      }
    }
    case 'weekly-activity': {
      const rows = await weeklyActivity(userId, 12)
      return {
        columns: ['week_start', 'count'],
        rows: rows.map((r) => [r.weekStart, r.count]),
      }
    }
    case 'status-distribution': {
      const rows = await statusDistribution(userId)
      return {
        columns: ['status', 'count'],
        rows: rows.map((r) => [r.status, r.count]),
      }
    }
    case 'ai-usage': {
      const stats = await aiUsageStats(userId, 30)
      return {
        columns: [
          'provider',
          'kind',
          'calls',
          'prompt_tokens',
          'completion_tokens',
          'avg_latency_ms',
          'estimated_cost_usd',
        ],
        rows: stats.rows.map((r) => [
          r.provider,
          r.kind,
          r.calls,
          r.promptTokens,
          r.completionTokens,
          r.avgLatencyMs,
          Number(r.estimatedCostUsd.toFixed(6)),
        ]),
      }
    }
    case 'monthly-expenses': {
      const bars = await monthlyExpenses(userId, 6)
      // Long-format so pivoting downstream stays trivial regardless of how
      // many categories appear across the window.
      const rows: (string | number)[][] = []
      for (const bar of bars) {
        if (bar.perCategory.length === 0) {
          rows.push([bar.month, '', 0])
          continue
        }
        for (const c of bar.perCategory) {
          rows.push([bar.month, c.category, c.totalCents])
        }
      }
      return {
        columns: ['month', 'category', 'total_cents'],
        rows,
      }
    }
    case 'budget-vs-actual': {
      const rows = await budgetVsActual(userId)
      return {
        columns: ['category', 'budget_cents', 'actual_cents', 'currency'],
        rows: rows.map((r) => [r.category, r.budgetCents, r.actualCents, r.currency]),
      }
    }
  }
}

export const _internal = { escapeCell, serialiseCsv }
