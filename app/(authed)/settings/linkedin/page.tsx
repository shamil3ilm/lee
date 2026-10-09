import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import { listComposerSources } from '@/lib/integrations/linkedin/composer'
import { loadOptimizer } from '@/lib/integrations/linkedin/optimizer-service'
import { getLinkedInStatus } from '@/lib/integrations/linkedin/service'
import { getResumeProfile } from '@/lib/resume/service'
import { PageHeader } from '@/components/page-header'
import { SECTION_ANCHOR, SectionNav } from '@/components/section-nav'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalTime } from '@/components/local-time'
import { ConnectionsPanel } from '@/components/linkedin/connections-panel'
import { ExportImport } from '@/components/linkedin/export-import'
import { OptimizerPanel } from '@/components/linkedin/optimizer-panel'
import { PostComposer, type ComposerSourceOption } from '@/components/linkedin/post-composer'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { id: 'linkedin-import', label: 'Import' },
  { id: 'linkedin-connections', label: 'Connections' },
  { id: 'linkedin-optimizer', label: 'Profile optimizer' },
  { id: 'linkedin-composer', label: 'Post composer' },
]

/** Settings › LinkedIn: the data-export import, connections, profile optimizer and post composer. */
export default async function LinkedInSettingsPage() {
  const userId = await requireUserId()
  const [{ profile }, status, count, initial, optimizer, sources, posts] = await Promise.all([
    getResumeProfile(userId),
    getLinkedInStatus(userId),
    linkedinQ.countConnections(userId),
    linkedinQ.searchConnections(userId, '', 50),
    loadOptimizer(userId),
    listComposerSources(userId),
    linkedinQ.listPosts(userId, 20),
  ])
  const options: ComposerSourceOption[] = sources.map((s) => ({ id: s.id, kind: s.kind, label: s.label }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="LinkedIn"
        description="Import your LinkedIn data export, get referral hints from your connections, tune your profile and draft posts. lee never posts, likes, comments or connects on its own."
      />
      <SectionNav sections={SECTIONS} />
      <Card id="linkedin-import" className={SECTION_ANCHOR}>
        <CardHeader>
          <CardTitle className="text-base">Import your LinkedIn data</CardTitle>
        </CardHeader>
        <CardContent>
          <ExportImport profile={profile} />
        </CardContent>
      </Card>
      <Card id="linkedin-connections" className={SECTION_ANCHOR}>
        <CardHeader>
          <CardTitle className="text-base">Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionsPanel
            key={count}
            count={count}
            initial={initial.map((r) => ({ id: r.id, name: r.name, company: r.company, position: r.position, connectedOn: r.connectedOn }))}
          />
        </CardContent>
      </Card>
      <Card id="linkedin-optimizer" className={SECTION_ANCHOR}>
        <CardHeader>
          <CardTitle className="text-base">Profile optimizer</CardTitle>
        </CardHeader>
        <CardContent>
          <OptimizerPanel imported={optimizer.imported} checklist={optimizer.checklist} />
        </CardContent>
      </Card>
      <Card id="linkedin-composer" className={SECTION_ANCHOR}>
        <CardHeader>
          <CardTitle className="text-base">Post composer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!status.connected ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/settings/integrations#linkedin" className="underline">
                Connect LinkedIn
              </Link>{' '}
              with posting allowed to post from lee. You can still draft and copy.
            </p>
          ) : null}
          <PostComposer sources={options} canPost={status.canPost && !status.expired} connected={status.connected} />
          <div className="space-y-2 border-t pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Posted from lee</h3>
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="linkedin-post-history">
                {posts.map((p) => (
                  <li key={p.id} className="rounded-md border p-2">
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <LocalTime date={p.postedAt.toISOString()} format="datetime-year" />
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                          View on LinkedIn
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line">{p.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
