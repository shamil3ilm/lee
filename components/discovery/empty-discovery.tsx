import { Fragment } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { elsewhereParts, type ElsewhereCounts } from '@/lib/ui/empty-why'
import { RunSourcesButton } from './run-sources-button'

interface EmptyDiscoveryProps {
  /** "Kuwait" when a region filter is on, else null. */
  regionLabel: string | null
  /** The `?region=` value, kept on the links. */
  region: string
  /** Where that region's postings are instead. */
  elsewhere: ElsewhereCounts
  /** The same page without the region filter. */
  clearHref: string | null
}

/**
 * One empty state for an empty triage view (an all-empty board, or an empty
 * New list), instead of three "Drop a card here" columns: what is empty, why
 * ("3 filtered · 1 needs a look in Kuwait"), and the next steps (Run now,
 * coverage, clear the filter).
 */
export function EmptyDiscovery({ regionLabel, region, elsewhere, clearHref }: EmptyDiscoveryProps) {
  const parts = elsewhereParts(elsewhere, region)
  const where = regionLabel ? ` in ${regionLabel}` : ''
  const coverageHref = `/settings/sources?from=${encodeURIComponent('/discoveries')}#coverage`
  return (
    <section
      aria-labelledby="empty-discovery-title"
      data-testid="empty-discovery"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 px-4 py-10 text-center"
    >
      <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 id="empty-discovery-title" className="text-base font-semibold">
        {regionLabel ? `No jobs to triage in ${regionLabel} yet` : 'Nothing to triage right now'}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground" data-testid="empty-discovery-why">
        {parts.length > 0 ? (
          <>
            {parts.map((p, i) => (
              <Fragment key={p.key}>
                {i > 0 ? ' · ' : null}
                <Link href={p.href} className="font-medium text-foreground underline-offset-2 hover:underline">
                  {p.text}
                </Link>
              </Fragment>
            ))}
            {where}. Nothing new is waiting.
          </>
        ) : (
          <>No postings{where} have arrived from your sources yet: nothing was found, nothing was filtered out.</>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <RunSourcesButton />
        <Button asChild size="sm" variant="outline">
          <Link href={coverageHref}>{regionLabel ? `Coverage for ${regionLabel}` : 'Improve coverage'}</Link>
        </Button>
        {clearHref ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={clearHref}>Clear the region filter</Link>
          </Button>
        ) : null}
      </div>
    </section>
  )
}
