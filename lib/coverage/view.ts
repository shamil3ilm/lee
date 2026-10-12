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
  /** Employer boards found (auto-detect) and not read yet: "12 employer boards found in Kuwait — turn on". */
  employerBoards: number
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
    employerBoards: r.employerBoards,
    why: r.why,
    suggestions: r.suggestions,
  }))
}

/**
 * The regions the one-line summary names: starred regions only, at most
 * `max`. Without stars the line asks for them instead of listing the
 * weakest regions (a permanent "none" for a city like Calicut alarmed
 * without helping; review 2026-10-10 §2.3).
 */
export function lineRegions(rows: readonly CoverageRowView[], max = 3): CoverageRowView[] {
  return rows.filter((r) => r.starred).slice(0, max)
}
