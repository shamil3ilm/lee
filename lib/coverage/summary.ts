import type { CoverageStatus } from './compute'

/**
 * Coverage copy shared by the Discovery line and the Settings panel: plain
 * words for the status ("good", "thin", "no source yet"; never "None
 * coverage") and the source count that includes broad and alert sources.
 * Pure, client-safe.
 */

export const COVERAGE_WORD: Readonly<Record<CoverageStatus, string>> = {
  green: 'good',
  amber: 'thin',
  red: 'no source yet',
}

/** Badge text in Settings › Sources › Coverage. */
export const COVERAGE_BADGE: Readonly<Record<CoverageStatus, string>> = {
  green: 'Good coverage',
  amber: 'Thin coverage',
  red: 'No source yet',
}

export interface SummaryInput {
  regionSources: number
  broadSources: number
  setupSources: number
  kept: number
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** "4 sources incl. 2 alerts · 12 jobs this week" (or "no source yet · 0 jobs this week"). */
export function coverageSummary(r: SummaryInput): string {
  const total = r.regionSources + r.broadSources + r.setupSources
  const sources =
    total === 0
      ? 'no source yet'
      : `${plural(total, 'source')}${r.setupSources > 0 ? ` incl. ${plural(r.setupSources, 'alert')}` : ''}`
  return `${sources} · ${plural(r.kept, 'job')} this week`
}
