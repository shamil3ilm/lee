'use client'
import { ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/linkedin/copy-button'
import { Button } from '@/components/ui/button'
import type { PortfolioSnippet } from '@/lib/import/snippet'

interface PortfolioSuggestionsProps {
  snippets: readonly PortfolioSnippet[]
  profileUrl: string | null
  savedCount: number
  onDone: () => void
}

/**
 * "Suggested additions for your portfolio": while public profile facts are
 * edited only in the portfolio, the ticked public items come back as JSON
 * Resume snippets to paste into profile.json. lee pulls them from there and
 * applies the readiness chosen in the review when they arrive.
 */
export function PortfolioSuggestions({ snippets, profileUrl, savedCount, onDone }: PortfolioSuggestionsProps) {
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-labelledby="portfolio-suggestions-title" data-testid="portfolio-suggestions">
      <div className="space-y-1">
        <h3 id="portfolio-suggestions-title" className="text-sm font-semibold">
          Suggested additions for your portfolio
        </h3>
        <p className="text-xs text-muted-foreground">
          Your public profile comes from your portfolio’s profile.json. Paste these there; lee picks them up on the next sync with the readiness you
          chose.
          {savedCount > 0 ? ` ${savedCount} lee-only item${savedCount === 1 ? ' was' : 's were'} saved.` : ''}
        </p>
      </div>
      {snippets.length === 0 ? <p className="text-sm text-muted-foreground">No public items were ticked.</p> : null}
      {snippets.map((s) => (
        <div key={s.section} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">
              {s.label} <span className="text-muted-foreground">({s.count})</span>
            </span>
            <CopyButton text={s.json} label={`Copy ${s.label}`} />
          </div>
          <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-xs" data-testid={`portfolio-snippet-${s.section}`}>
            <code>{s.json}</code>
          </pre>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {profileUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={profileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Open profile.json on GitHub
            </a>
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  )
}
