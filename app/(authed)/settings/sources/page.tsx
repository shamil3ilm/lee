import { Rss } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import { PageHeader } from '@/components/page-header'
import { AddSourceDialog } from '@/components/add-source-dialog'
import { SourceRow, type SourceRowItem } from '@/components/source-row'
import { EmptyState } from '@/components/empty-state'
import { PopularStarters } from './popular-starters'

export const dynamic = 'force-dynamic'

interface SourceConfig {
  company?: string
  url?: string
  [k: string]: unknown
}

function configSummary(kind: string, config: SourceConfig): string {
  if (config.company) return `company: ${config.company}`
  if (config.url) return String(config.url)
  return kind === 'remoteok' || kind === 'hn_whoishiring' || kind === 'yc_directory'
    ? 'all'
    : '—'
}

export default async function SourcesSettingsPage(): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const sources = await sourcesQ.list(userId)

  const rows: SourceRowItem[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    enabled: s.enabled,
    configSummary: configSummary(s.kind, (s.config ?? {}) as SourceConfig),
    lastPolledAt: s.lastPolledAt ? s.lastPolledAt.toISOString() : null,
    lastError: s.lastError,
    errorCount: s.errorCount,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Sources"
        description="Where discoveries come from. Each source is polled on the daily discovery cycle."
        actions={<AddSourceDialog />}
      />

      {rows.length === 0 ? (
        <>
          <EmptyState
            icon={Rss}
            title="No sources yet"
            description="Add a source to start seeing scored jobs and companies in Discovery."
          />
          <PopularStarters />
        </>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <SourceRow key={r.id} source={r} />
          ))}
        </div>
      )}
    </div>
  )
}
