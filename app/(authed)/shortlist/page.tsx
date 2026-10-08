import Link from 'next/link'
import { ArrowRight, Lightbulb, ListChecks, Settings2 } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { loadShortlistPage, type ShortlistEntryView } from '@/lib/apply/page-data'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShortlistList } from '@/components/apply/shortlist-list'
import { RefreshShortlistButton } from '@/components/apply/refresh-shortlist-button'
import { shortDay } from '@/lib/ui/date'
import { getProfile } from '@/lib/profile/service'
import { defaultsBannerFamilies } from '@/lib/discovery/relevance/view'
import { DefaultsBanner } from '@/components/discovery/defaults-banner'

export const dynamic = 'force-dynamic'

const STATE_BADGE: Record<Exclude<ShortlistEntryView['state'], 'open'>, { label: string; variant: BadgeProps['variant'] }> = {
  preparing: { label: 'Preparing', variant: 'info' },
  later: { label: 'Later', variant: 'neutral' },
  dismissed: { label: 'Not for me', variant: 'neutral' },
}

/**
 * Daily shortlist: the top N new or recent discoveries, ranked by one
 * explainable composite (lib/apply/rank.ts). Reads the snapshot the
 * `shortlist:user` job wrote after the morning polls, so it loads at once.
 */
export default async function ShortlistPage() {
  const userId = await requireUserId()
  const [data, profile] = await Promise.all([loadShortlistPage(userId), getProfile(userId)])
  const bannerFamilies = defaultsBannerFamilies(profile)
  const subtitle = data.day
    ? data.today
      ? `Today's top ${data.size} new roles, ranked by fit. Prepare, park for later, or pass.`
      : `From ${shortDay(data.day)}. Today's list is built after the morning discovery run, or refresh now.`
    : 'Your top new roles each day, ranked by fit, once discovery has found some.'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shortlist"
        description={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshShortlistButton />
            <Button asChild size="sm" variant="ghost">
              <Link href="/settings/notifications#shortlist-settings">
                <Settings2 className="size-4" />
                Settings
              </Link>
            </Button>
          </div>
        }
      />

      {bannerFamilies ? <DefaultsBanner families={bannerFamilies} /> : null}

      {data.open.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={data.day ? 'Nothing left on today’s shortlist' : 'No shortlist yet'}
          description={
            data.day
              ? 'You have acted on every pick. New postings join tomorrow’s list, or refresh to pull in the next best.'
              : 'Add discovery sources and run them; the shortlist is built after each daily run.'
          }
          action={data.day ? <RefreshShortlistButton label="Refresh shortlist" variant="default" /> : (
            <Button asChild size="sm">
              <Link href="/settings/sources">Add sources</Link>
            </Button>
          )}
        />
      ) : (
        <ShortlistList items={data.open} />
      )}

      {data.suggestions.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4 text-muted-foreground" aria-hidden="true" />
              From your “Not for me” answers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            {data.suggestions.map((s) => (
              <p key={s.id} className="flex flex-wrap items-center gap-x-2">
                <span>{s.text}</span>
                <Link href={s.href} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
                  Review
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.acted.length > 0 ? (
        <section aria-labelledby="shortlist-acted" className="space-y-3">
          <h2 id="shortlist-acted" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Already handled
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {data.acted.map((e) => {
              const badge = STATE_BADGE[e.state as keyof typeof STATE_BADGE]
              return (
                <li key={e.discoveryId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{e.companyName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                    {e.state === 'preparing' && e.applicationId ? (
                      <Link
                        href={`/applications/${e.applicationId}/prepare`}
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Continue
                      </Link>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
