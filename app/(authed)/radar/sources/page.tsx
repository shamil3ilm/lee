import { requireUserId } from '@/lib/auth/require-session'
import * as profileQ from '@/lib/db/queries/profile'
import { OFFICIAL_FEEDS } from '@/lib/radar/feeds-catalog'
import { loadSourceStatuses, STALE_AFTER_HOURS, type SourceStatus } from '@/lib/radar/status'
import { RADAR_SOURCE_LABELS } from '@/lib/radar/types'
import { relativeFromNow } from '@/lib/ui/date'
import { PageHeader } from '@/components/page-header'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SourceToggle } from '@/components/radar/source-toggle'
import { ReleaseProjectsPanel } from '@/components/radar/release-projects-panel'
import { loadPersonalContext } from '@/lib/radar/new/personal'

export const dynamic = 'force-dynamic'

const STATE: Readonly<Record<SourceStatus['state'], { label: string; variant: BadgeProps['variant'] }>> = {
  ok: { label: 'Fresh', variant: 'success' },
  stale: { label: 'Stale', variant: 'warning' },
  failing: { label: 'Failing', variant: 'danger' },
  off: { label: 'Off', variant: 'neutral' },
  never: { label: 'Not run yet', variant: 'neutral' },
}

const LIMITS: Readonly<Record<string, string>> = {
  hf: 'Trending models, Spaces and datasets. Public API, 500 requests per 5 minutes; an optional token in Settings › AI.',
  hf_papers: 'The curated Daily Papers list. Public API.',
  github: 'Rising repos (llm, agents, inference) and repos naming a watch term. Search API: 10 a minute, 30 with the optional token.',
  arxiv: 'Newest cs.CL, cs.LG and cs.AI submissions. arXiv API terms: one request every 3 seconds.',
  hn: 'Stories naming a watch term, via the Algolia API (10,000 requests an hour).',
  feeds: `Official blogs and newsrooms (${OFFICIAL_FEEDS.length} feeds): posts from the last 14 days.`,
  gdelt: 'News naming a watch term, last 7 days. GDELT DOC 2.0: one request per 5 seconds.',
}

export default async function RadarSourcesPage() {
  const userId = await requireUserId()
  const off = (await profileQ.get(userId))?.radarSourcesOff ?? []
  const [statuses, personal] = await Promise.all([loadSourceStatuses(userId, off), loadPersonalContext(userId)])
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Sources"
        description={`Free sources, fetched once a day in the background. Switching one off also hides it from What’s new. A source is stale when it has not fetched successfully for ${STALE_AFTER_HOURS} hours; a rate limit skips that day.`}
      />
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y" aria-label="Radar sources">
            {statuses.map((s) => (
              <li key={s.source} className="flex flex-wrap items-start gap-3 p-4" data-testid="radar-source">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{RADAR_SOURCE_LABELS[s.source]}</span>
                    <Badge variant={STATE[s.state].variant}>{STATE[s.state].label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{LIMITS[s.source]}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.lastOkAt ? `Last fetched ${relativeFromNow(s.lastOkAt)} · ${s.lastNew} new` : 'No successful fetch yet'}
                  </p>
                  {s.lastError ? <p className="break-words text-xs text-danger">Last error: {s.lastError}</p> : null}
                </div>
                <SourceToggle source={s.source} label={RADAR_SOURCE_LABELS[s.source]} on={s.state !== 'off'} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card id="releases">
        <CardHeader>
          <CardTitle className="text-base">Releases in What&apos;s new</CardTitle>
          <CardDescription>The projects whose new major and minor releases What&apos;s new shows you.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReleaseProjectsPanel selected={personal.releaseProjects} derived={personal.releaseProjectsDerived} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Official feeds</CardTitle>
          <CardDescription>
            Checked on Oct 8, 2026: each answers RSS or Atom and its robots.txt allows the feed. lee keeps the title, link, date and a
            short excerpt, and links back. Anthropic, Meta AI, xAI, Cohere and DeepSeek offer no feed and are not fetched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {OFFICIAL_FEEDS.map((f) => (
              <li key={f.id} className="min-w-0 truncate">
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {f.label}
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
