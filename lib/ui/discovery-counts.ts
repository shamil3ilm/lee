/**
 * Discovery's subtitle: outcomes, not inserts. "886 fetched · 6 to triage ·
 * 880 filtered", each part linking to the view that lists it. "Fetched" is
 * what the last poll run inserted (lib/discovery/poll-stats.ts lastCheck);
 * the other parts are the inbox's current status counts, so "to triage"
 * always equals the New column and the sidebar badge (review 2026-10-10
 * §2.1). Pure and client-safe.
 */

export type CountPartKey = 'fetched' | 'triage' | 'needs-look' | 'filtered'

export interface CountPart {
  key: CountPartKey
  text: string
  href: string
}

export interface DiscoveryCountsInput {
  /** Rows the last poll run inserted (null: never polled). */
  fetched: number | null
  /** status = new, quarantine excluded. */
  toTriage: number
  /** The gate's "Needs a look" group (lib/ui/needs-look.ts seam; 0 hides it). */
  needsLook: number
  /** status = filtered. */
  filtered: number
}

export const COUNT_HREFS: Readonly<Record<CountPartKey, string>> = {
  // Per-source results of the last poll live with the sources.
  fetched: '/settings/sources',
  triage: '/discoveries?tab=jobs&view=list',
  // TODO(relevance): point at the "Needs a look" group once the gate exposes it.
  'needs-look': '/discoveries?tab=jobs&view=list',
  filtered: '/discoveries?tab=jobs&status=filtered&view=list',
}

const fmt = (n: number): string => n.toLocaleString('en-US')

export function discoveryCountParts(input: DiscoveryCountsInput): CountPart[] {
  const parts: CountPart[] = []
  if (input.fetched !== null) parts.push({ key: 'fetched', text: `${fmt(input.fetched)} fetched`, href: COUNT_HREFS.fetched })
  parts.push({ key: 'triage', text: `${fmt(input.toTriage)} to triage`, href: COUNT_HREFS.triage })
  if (input.needsLook > 0) {
    parts.push({
      key: 'needs-look',
      text: `${fmt(input.needsLook)} ${input.needsLook === 1 ? 'needs' : 'need'} a look`,
      href: COUNT_HREFS['needs-look'],
    })
  }
  parts.push({ key: 'filtered', text: `${fmt(input.filtered)} filtered`, href: COUNT_HREFS.filtered })
  return parts
}
