import Link from 'next/link'
import { ArrowRight, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MatchBadge } from '@/components/discovery/match-badge'
import { ShortlistReasons } from '@/components/apply/shortlist-reasons'
import { readShortlist } from '@/lib/apply/shortlist'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { joinMeta } from '@/lib/ui/meta'

const SHOWN = 3

/**
 * "Today's shortlist" at the top of Home: the first few open picks, each
 * with its one Fit badge (the shortlist's rank parts are in its popover).
 * Reads the precomputed snapshot only; renders nothing when there is none.
 */
export async function ShortlistStrip({ userId }: { userId: string }) {
  const view = await readShortlist(userId)
  const open = view.entries.filter((e) => e.state === 'open')
  if (!view.day || (open.length === 0 && !view.today)) return null
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
                  <div className="truncate font-medium">
                    <span className="mr-1.5 text-muted-foreground tabular-nums">#{e.rank}</span>
                    {repairMojibake(e.title ?? 'Untitled')}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {joinMeta([repairMojibake(e.companyName ?? 'Unknown company'), e.location ? repairMojibake(e.location) : null])}
                  </div>
                </div>
                <MatchBadge
                  match={e.fitScore}
                  ai={e.matchScore}
                  detail={toMatchDetail(e.fitDetail)}
                  extra={<ShortlistReasons rank={e.rank} score={e.score} reasons={e.reasons} />}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Discovery's header action: "Shortlist · 5", a button instead of a bar
 * above the list (the postings themselves are listed right below).
 */
export async function ShortlistHeaderLink({ userId }: { userId: string }) {
  const view = await readShortlist(userId)
  const open = view.entries.filter((e) => e.state === 'open')
  if (!view.day || (open.length === 0 && !view.today)) return null
  return (
    <Button asChild size="sm" variant="outline" data-testid="shortlist-banner">
      <Link href="/shortlist" aria-label={`Today’s shortlist: ${open.length === 0 ? 'every pick handled' : `${open.length} to review`}`}>
        <ListChecks className="size-4" aria-hidden="true" />
        Shortlist
        <Badge variant="secondary" className="tabular-nums">
          {open.length}
        </Badge>
      </Link>
    </Button>
  )
}
