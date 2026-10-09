import type { CoverageStatus } from './compute'
import type { UserCoverage } from './service'

/** What the panel shows per region (serialisable). */
export interface CoverageRowView {
  id: string
  label: string
  status: CoverageStatus
  starred: 'top' | 'preferred' | null
  regionSources: number
  broadSources: number
  setupSources: number
  available: number
  kept: number
  filtered: number
  companies: number
  why: string
  suggestions: { kind: string; text: string; href?: string }[]
}

/** Serialisable rows for the coverage panel and line. */
export function toRowViews(rows: readonly UserCoverage[]): CoverageRowView[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    status: r.status,
    starred: r.starred,
    regionSources: r.regionSources,
    broadSources: r.broadSources,
    setupSources: r.setupSources,
    available: r.available.length,
    kept: r.kept,
    filtered: r.activity.byStatus.filtered ?? 0,
    companies: r.activity.companies,
    why: r.why,
    suggestions: r.suggestions,
  }))
}

/**
 * The regions the one-line summary names: starred regions, else the
 * weakest of the rest (red before amber), at most `max`.
 */
export function lineRegions(rows: readonly CoverageRowView[], max = 3): CoverageRowView[] {
  const starred = rows.filter((r) => r.starred)
  if (starred.length > 0) return starred.slice(0, max)
  const weight = { red: 0, amber: 1, green: 2 } as const
  return [...rows].sort((a, b) => weight[a.status] - weight[b.status]).filter((r) => r.status !== 'green').slice(0, max)
}
