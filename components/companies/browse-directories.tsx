import { ExternalLink } from 'lucide-react'
import { CollapsibleSection } from '@/components/collapsible-section'
import { BROWSE_DIRECTORIES, BROWSE_GROUPS } from '@/lib/company-discovery/sources/browse'

/**
 * "Browse directories": startup, free-zone and IT-park company lists,
 * grouped by region, with whether lee reads each one or only links to it
 * (terms, bot walls, or no list). Folded by default at the bottom of the
 * Companies tab; plain links that open in the user's browser.
 */
export function BrowseDirectories() {
  return (
    <div data-testid="browse-directories">
      <CollapsibleSection
        id="browse-directories"
        title="Browse directories"
        count={BROWSE_DIRECTORIES.length}
        summary="Company lists of free zones, accelerators and IT parks. Add any company you find with “Add companies”."
        defaultOpen={false}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BROWSE_GROUPS.map((g) => {
            const items = BROWSE_DIRECTORIES.filter((d) => d.region === g.id)
            if (items.length === 0) return null
            return (
              <section key={g.id} aria-labelledby={`browse-${g.id}`}>
                <h3 id={`browse-${g.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </h3>
                <ul className="mt-1 space-y-1.5">
                  {items.map((d) => (
                    <li key={d.id} className="text-sm">
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                        {d.name}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                      <p className="text-xs text-muted-foreground">{d.why}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </CollapsibleSection>
    </div>
  )
}
