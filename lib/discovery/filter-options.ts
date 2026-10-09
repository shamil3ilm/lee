/**
 * Discovery filter vocabulary, shared by the toolbar and the page's URL
 * parser. Client-safe: no server imports.
 */

export type DiscoverySort = 'combined' | 'match' | 'benefits' | 'posted'
export type DiscoveryStatusFilter = 'new' | 'shortlisted' | 'saved' | 'dismissed' | 'filtered' | 'quarantined'
/** Region selection: lib/regions node ids (empty = all regions). */
export type DiscoveryRegionFilter = readonly string[]

export const STATUS_LABELS: Readonly<Record<DiscoveryStatusFilter, string>> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  saved: 'Saved',
  dismissed: 'Dismissed',
  filtered: 'Filtered out',
  quarantined: 'Quarantined',
}

export const SORT_LABELS: Readonly<Record<DiscoverySort, string>> = {
  combined: 'Combined (Fit + benefits)',
  match: 'Best fit',
  benefits: 'Benefits score',
  posted: 'Recently posted',
}

/** The filters behind "More filters". */
export interface MoreFilterValues {
  minScore: number
  sourceId: string
  scoredOnly: boolean
  /** Filtered-out postings shown (dimmed) in the New list. */
  showFiltered: boolean
}

/** How many "More filters" differ from their defaults (the button's count). */
export function activeMoreFilters(v: MoreFilterValues): number {
  return [v.minScore > 0, v.sourceId !== '', v.scoredOnly, v.showFiltered].filter(Boolean).length
}
