import { ExternalLink } from 'lucide-react'
import { BROWSE_DIRECTORIES, BROWSE_GROUPS } from '@/lib/company-discovery/sources/browse'

/**
 * "Browse directories": startup, free-zone and IT-park company lists lee
 * does not read (terms, bot walls, or no list), grouped by region. Plain
 * links that open in the user's browser.
 */
export function BrowseDirectories() {
  return (
    <details className="rounded-xl border bg-card p-4" data-testid="browse-directories">
      <summary className="cursor-pointer text-sm font-medium">Browse directories ({BROWSE_DIRECTORIES.length})</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Company lists of free zones, accelerators and IT parks. Most do not allow automated reading, so lee only links to them: add any company you find with “Add companies”.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    </details>
  )
}
