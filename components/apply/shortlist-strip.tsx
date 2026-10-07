import Link from 'next/link'
import { ArrowRight, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { readShortlist } from '@/lib/apply/shortlist'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { joinMeta } from '@/lib/ui/meta'

const SHOWN = 3

/**
 * "Today's shortlist" for the top of Home (the first few open picks with
 * their score) and Discovery (`banner`: one line with the count, since the
 * postings themselves are listed right below). Reads the precomputed
 * snapshot only; renders nothing when there is none.
 */
export async function ShortlistStrip({ userId, banner = false }: { userId: string; banner?: boolean }) {
  const view = await readShortlist(userId)
  const open = view.entries.filter((e) => e.state === 'open')
  if (!view.day || (open.length === 0 && !view.today)) return null
  if (banner) {
    return (
      <Link
        href="/shortlist"
        data-testid="shortlist-banner"
        className="flex items-center gap-2 rounded-lg border bg-info-soft px-3 py-2 text-sm text-info transition-colors hover:bg-info-soft/70"
      >
        <ListChecks className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">Today’s shortlist:</span>{' '}
          {open.length === 0 ? 'every pick handled' : `${open.length} ${open.length === 1 ? 'pick' : 'picks'} ranked by fit`}
        </span>
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    )
  }
  return (
    <Card data-testid="shortlist-strip">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          Today’s shortlist
          <Badge variant="secondary">{open.length}</Badge>
        </CardTitle>
        <Link
          href="/shortlist"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Open shortlist
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have handled every pick for today.</p>
        ) : (
          <ul className="divide-y">
            {open.slice(0, SHOWN).map((e) => (
              <li key={e.discoveryId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{repairMojibake(e.title ?? 'Untitled')}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {joinMeta([repairMojibake(e.companyName ?? 'Unknown company'), e.reasons[1]?.label])}
                  </div>
                </div>
                <Badge variant="info" className="tabular-nums" title="Shortlist score (0–100)">
                  {e.score}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
