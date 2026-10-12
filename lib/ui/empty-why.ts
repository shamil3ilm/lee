import { NEEDS_LOOK_HREF } from './needs-look'

/**
 * Why a Discovery view is empty: where that region's postings went instead
 * ("3 filtered · 1 needs a look in Kuwait"), so "nothing was found" and "all
 * of it was filtered out" read differently. Each part links to its view with
 * the same region. Pure and client-safe.
 */

export interface ElsewhereCounts {
  filtered: number
  needsLook: number
  shortlisted: number
  saved: number
  dismissed: number
}

export interface ElsewherePart {
  key: keyof ElsewhereCounts
  text: string
  href: string
}

const LABEL: Readonly<Record<keyof ElsewhereCounts, (n: number) => string>> = {
  filtered: (n) => `${n} filtered`,
  needsLook: (n) => `${n} ${n === 1 ? 'needs' : 'need'} a look`,
  shortlisted: (n) => `${n} shortlisted`,
  saved: (n) => `${n} in pipeline`,
  dismissed: (n) => `${n} dismissed`,
}

const STATUS: Readonly<Record<keyof ElsewhereCounts, string>> = {
  filtered: 'filtered',
  needsLook: 'review',
  shortlisted: 'shortlisted',
  saved: 'saved',
  dismissed: 'dismissed',
}

const ORDER: ReadonlyArray<keyof ElsewhereCounts> = ['filtered', 'needsLook', 'shortlisted', 'saved', 'dismissed']

function hrefFor(key: keyof ElsewhereCounts, region: string): string {
  const base = key === 'needsLook' ? NEEDS_LOOK_HREF : `/discoveries?tab=jobs&status=${STATUS[key]}&view=list`
  return region ? `${base}&region=${encodeURIComponent(region)}` : base
}

/** The non-zero statuses, most telling first (filtered before dismissed). */
export function elsewhereParts(counts: ElsewhereCounts, region: string): ElsewherePart[] {
  return ORDER.filter((k) => counts[k] > 0).map((k) => ({ key: k, text: LABEL[k](counts[k]), href: hrefFor(k, region) }))
}
