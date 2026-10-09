'use client'
import { Info } from 'lucide-react'
import { ResponsivePopover } from '@/components/responsive-popover'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'

/**
 * Where the companies come from, in one line, with the details a tap away:
 * the sources lee reads, how often, and what it never does.
 */

const SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['IT parks and member lists', 'Technopark, Infopark, Kerala Cyberpark, UL Cyberpark, QSTP, NASSCOM, Flat6Labs, StartUp Bahrain: the full lists, weekly.'],
  ['Employers in your jobs', 'Every employer of a posting lee collected, your applications and your watch list.'],
  ['GitHub organisations', 'Organisations by city, a few pages a week.'],
  ['Wikidata and Y Combinator', 'Companies headquartered in your regions.'],
  ['Your LinkedIn connections', 'Companies where two or more of your connections work.'],
  ['Well-known employers', 'A short checked list so big names are never missed; it adds no points.'],
]

export function SourcesNote({ lastRun }: { lastRun: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground" data-testid="companies-sources-note">
      <span>From IT parks, member lists, employers in your jobs, GitHub and Wikidata, with a growth score.</span>
      <span>{lastRun ? `Last search ${lastRun}.` : 'The first search runs this week.'}</span>
      <ResponsivePopover
        title="How lee finds companies"
        contentClassName="w-96"
        trigger={
          <button type="button" className={cn('inline-flex min-h-6 items-center gap-1 rounded-md text-sm font-medium text-foreground underline underline-offset-4', focusRing)} data-testid="companies-sources-details">
            <Info className="size-3.5" aria-hidden="true" />
            How it works
          </button>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="font-semibold">How lee finds companies</p>
          <ul className="space-y-2">
            {SOURCES.map(([title, text]) => (
              <li key={title}>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            lee reads only lists whose robots.txt and terms allow it, never logs in, and reads a company site only after its robots.txt. Directories it may not read are under “Browse directories” at the bottom of this tab.
          </p>
        </div>
      </ResponsivePopover>
    </div>
  )
}
