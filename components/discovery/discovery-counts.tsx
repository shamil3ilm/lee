import { Fragment } from 'react'
import Link from 'next/link'
import { discoveryCountParts, type DiscoveryCountsInput } from '@/lib/ui/discovery-counts'

/**
 * "Last checked 5h ago · 886 fetched · 6 to triage · 880 filtered" under the
 * Discovery title, each count linking to its view.
 */
export function DiscoveryCounts({ checked, ...counts }: DiscoveryCountsInput & { checked: string | null }) {
  const parts = discoveryCountParts(counts)
  return (
    <span data-testid="discovery-counts" title={checked ? `Last checked ${checked}` : undefined}>
      {/* Phones keep the counts on one line; the time is in the title. */}
      {checked ? <span className="max-sm:hidden">Last checked {checked} · </span> : null}
      {parts.map((p, i) => (
        <Fragment key={p.key}>
          {i > 0 ? ' · ' : null}
          <Link
            href={p.href}
            data-count={p.key}
            className="font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
          >
            {p.text}
          </Link>
        </Fragment>
      ))}
    </span>
  )
}
