/**
 * Discovery filter vocabulary, shared by the toolbar and the page's URL
 * parser. Client-safe: no server imports.
 */

export type DiscoverySort = 'combined' | 'match' | 'benefits' | 'posted'
/** 'review' = "Needs a look": status new, held out of New (relevance_notes.needsLook). */
export type DiscoveryStatusFilter = 'new' | 'review' | 'shortlisted' | 'saved' | 'dismissed' | 'filtered' | 'quarantined'
/** Region selection: lib/regions node ids (empty = all regions). */
export type DiscoveryRegionFilter = readonly string[]

export const STATUS_LABELS: Readonly<Record<DiscoveryStatusFilter, string>> = {
  new: 'New',
  review: 'Needs a look',
  shortlisted: 'Shortlisted',
  saved: 'Saved',
  dismissed: 'Dismissed',
  filtered: 'Filtered out',
  quarantined: 'Quarantined',
}

/** The default sort: the displayed Fit. */
export const DEFAULT_SORT: DiscoverySort = 'match'

/**
 * The sorts offered. "Combined (Fit + benefits)" is hidden: no source
 * extracts benefits yet, so it was Fit × 0.6 + 0; old ?sort=combined links
 * sort by Fit.
 */
export const SORT_LABELS: Readonly<Partial<Record<DiscoverySort, string>>> = {
  match: 'Best fit',
  benefits: 'Benefits score',
  posted: 'Recently posted',
}

/** A ?sort= value → the sort to use ("combined" and unknown values → Best fit). */
export function parseSort(raw: string | undefined): DiscoverySort {
  return raw === 'benefits' || raw === 'posted' ? raw : DEFAULT_SORT
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
