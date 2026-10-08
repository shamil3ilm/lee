import { Rss } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import { getSourceKind, sourceKindNeeds } from '@/lib/discovery/source-kinds'
import { PageHeader } from '@/components/page-header'
import { AddSourceDialog } from '@/components/add-source-dialog'
import { SourceRow, type SourceRowItem } from '@/components/source-row'
import { EmptyState } from '@/components/empty-state'
import { EmailAlertsPanel } from '@/components/email-alerts-panel'
import { WatchListPanel, type WatchItem } from '@/components/watch-list-panel'
import { GoogleAlertsPanel } from '@/components/google-alerts-panel'
import { googleAlertsPanelData } from '@/lib/google-alerts/panel-data'
import { getProfile } from '@/lib/profile/service'
import { EmployerWatchPanel } from '@/components/employer-watch-panel'
import { employerWatchRows } from '@/lib/defaults/watch-status'
import { lastSeenBySource } from '@/lib/defaults/watch-last-seen'
import { PopularStarters } from './popular-starters'
import { describePollStats, readSourceLastResult } from '@/lib/discovery/poll-stats'

function lastResultLine(raw: unknown): string | null {
  const r = readSourceLastResult(raw)
  return r ? describePollStats(r) : null
}

export const dynamic = 'force-dynamic'

interface SourceConfig {
  company?: string
  url?: string
  reason?: string
  [k: string]: unknown
}

function configSummary(kind: string, config: SourceConfig): string {
  if (config.company) return `company: ${config.company}`
  if (config.url) return String(config.url)
  if (typeof config.host === 'string') return `site: ${config.host}`
  return sourceKindNeeds(kind) === 'none' ? 'all' : '—'
}

function configValue(config: SourceConfig): string {
  if (typeof config.company === 'string') return config.company
  if (typeof config.url === 'string') return config.url
  return ''
}

export default async function SourcesSettingsPage(): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const [sources, alertStats, profile] = await Promise.all([
    sourcesQ.list(userId),
    emailAlertsQ.summaryBySite(userId),
    getProfile(userId),
  ])
  const googleAlerts = googleAlertsPanelData(profile, sources)

  const polled = sources.filter((s) => s.kind !== 'watch')
  const lastSeen = await lastSeenBySource(
    userId,
    polled.map((s) => s.id),
  )
  const employerRows = employerWatchRows(sources, lastSeen)
  // Employer links live in the employer watch list, not in "Check these yourself".
  const employerSourceIds = new Set(employerRows.map((r) => r.sourceId).filter(Boolean))
  const watch: WatchItem[] = sources
    .filter((s) => s.kind === 'watch' && !employerSourceIds.has(s.id))
    .map((s) => {
      const c = (s.config ?? {}) as SourceConfig
      return { id: s.id, name: s.name, url: String(c.url ?? ''), reason: typeof c.reason === 'string' ? c.reason : null }
    })
    .filter((w) => /^https?:\/\//i.test(w.url))

  const rows: SourceRowItem[] = polled.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    enabled: s.enabled,
    configSummary: configSummary(s.kind, (s.config ?? {}) as SourceConfig),
    configValue: configValue((s.config ?? {}) as SourceConfig),
    lastPolledAt: s.lastPolledAt ? s.lastPolledAt.toISOString() : null,
    lastError: s.lastError,
    errorCount: s.errorCount,
    lastResult: lastResultLine(s.lastResult),
  }))

  const alertSource = sources.find((s) => s.kind === 'email_alert')
  // Providers whose terms ask for a visible credit (Himalayas, Adzuna …).
  const credits = [
    ...new Map(
      polled
        .map((s) => getSourceKind(s.kind)?.attribution)
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .map((a) => [a.url, a] as const),
    ).values(),
  ]

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
            // Keyed on `enabled` too so an edit that flips it remounts the
            // row's optimistic toggle state from fresh props.
            <SourceRow key={`${r.id}-${r.enabled}`} source={r} />
          ))}
        </div>
      )}

      <EmailAlertsPanel
        stats={alertStats.map((s) => ({ ...s, lastAlertAt: s.lastAlertAt ? s.lastAlertAt.toISOString() : null }))}
        source={alertSource ? { enabled: alertSource.enabled, lastError: alertSource.lastError } : null}
      />

      <GoogleAlertsPanel queries={googleAlerts.queries} source={googleAlerts.source} />
      <EmployerWatchPanel rows={employerRows} />

      <WatchListPanel items={watch} />

      {credits.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Job listings from{' '}
          {credits.map((c, i) => (
            <span key={c.url}>
              {i > 0 ? ', ' : ''}
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {c.label}
              </a>
            </span>
          ))}
          . Each discovery links back to the original posting on that site.
        </p>
      ) : null}
    </div>
  )
}
