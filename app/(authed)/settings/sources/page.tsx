import { Bell, Building2, Eye, Mail, MapPin, Rss } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import { getSourceKind, sourceKindNeeds } from '@/lib/discovery/source-kinds'
import { PageHeader } from '@/components/page-header'
import { AddSourceDialog } from '@/components/add-source-dialog'
import { SourceRow, type SourceRowItem } from '@/components/source-row'
import { EmptyState } from '@/components/empty-state'
import { EmailAlertsPanel, emailAlertsSummary } from '@/components/email-alerts-panel'
import { WatchListPanel, type WatchItem } from '@/components/watch-list-panel'
import { GoogleAlertsPanel } from '@/components/google-alerts-panel'
import { googleAlertsPanelData } from '@/lib/google-alerts/panel-data'
import { getProfile } from '@/lib/profile/service'
import { EmployerWatchPanel } from '@/components/employer-watch-panel'
import { employerWatchRows } from '@/lib/defaults/watch-status'
import { watchSummary } from '@/lib/defaults/watch-filter'
import { lastSeenBySource } from '@/lib/defaults/watch-last-seen'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { CollapsibleSection } from '@/components/collapsible-section'
import { SectionNav } from '@/components/section-nav'
import { ReturnLink } from '@/components/settings/return-link'
import { PopularStarters } from './popular-starters'
import { describePollStats, readSourceLastResult } from '@/lib/discovery/poll-stats'
import { CoveragePanel } from '@/components/coverage/coverage-panel'
import { userCoverage } from '@/lib/coverage/service'
import { toRowViews } from '@/lib/coverage/view'

export const dynamic = 'force-dynamic'

interface SourceConfig {
  company?: string
  url?: string
  reason?: string
  [k: string]: unknown
}

function lastResultLine(raw: unknown): string | null {
  const r = readSourceLastResult(raw)
  return r ? describePollStats(r) : null
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

/** "12 on · 1 off · 1 failing". */
function sourcesSummary(rows: readonly SourceRowItem[]): string {
  if (rows.length === 0) return 'None yet'
  const on = rows.filter((r) => r.enabled).length
  const failing = rows.filter((r) => r.enabled && r.lastError).length
  const parts = [`${on} on`]
  if (rows.length > on) parts.push(`${rows.length - on} off`)
  if (failing > 0) parts.push(`${failing} failing`)
  return parts.join(' · ')
}

export default async function SourcesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const [sources, alertStats, profile, sp, coverage] = await Promise.all([
    sourcesQ.list(userId),
    emailAlertsQ.summaryBySite(userId),
    getProfile(userId),
    searchParams,
    userCoverage(userId),
  ])
  const coverageRows = toRowViews(coverage)
  const weak = coverageRows.filter((r) => r.status !== 'green').length
  const googleAlerts = googleAlertsPanelData(profile, sources)

  const polled = sources.filter((s) => s.kind !== 'watch')
  const lastSeen = await lastSeenBySource(
    userId,
    polled.map((s) => s.id),
  )
  const employerRows = employerWatchRows(sources, lastSeen)
  // Employer links live in the employer watch list, not in "Check yourself".
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
  const alertSourceView = alertSource ? { enabled: alertSource.enabled, lastError: alertSource.lastError } : null
  const alertStatViews = alertStats.map((s) => ({ ...s, lastAlertAt: s.lastAlertAt ? s.lastAlertAt.toISOString() : null }))
  const ga = googleAlerts.source
  // Providers whose terms ask for a visible credit (Himalayas, Adzuna …).
  const credits = [
    ...new Map(
      polled
        .map((s) => getSourceKind(s.kind)?.attribution)
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
        .map((a) => [a.url, a] as const),
    ).values(),
  ]

  const sections = [
    { id: 'coverage', label: 'Coverage' },
    { id: 'your-sources', label: 'Your sources' },
    { id: 'email-alerts', label: 'Job alerts' },
    { id: 'google-alerts', label: 'Google Alerts' },
    ...(employerRows.length > 0 ? [{ id: 'employer-watch', label: 'Employer watch' }] : []),
    ...(watch.length > 0 ? [{ id: 'watch-list', label: 'Check yourself' }] : []),
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <ReturnLink from={sp.from} />
      <PageHeader
        title="Sources"
        description="Where discoveries come from. Each source is checked on the daily discovery cycle."
        actions={<AddSourceDialog />}
      />
      <SectionNav sections={sections} />

      <CollapsibleSection
        id="coverage"
        title="Coverage"
        icon={<MapPin />}
        count={coverageRows.length}
        summary={coverageRows.length === 0 ? 'No regions chosen' : weak === 0 ? 'Every region covered' : `${weak} of ${coverageRows.length} regions need more sources`}
      >
        <CoveragePanel rows={coverageRows} />
      </CollapsibleSection>

      <CollapsibleSection id="your-sources" title="Your sources" icon={<Rss />} count={rows.length} summary={sourcesSummary(rows)}>
        {rows.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              size="sm"
              icon={Rss}
              title="No sources yet"
              description="Add a source to start seeing scored jobs and companies in Discovery."
            />
            <PopularStarters />
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              // Keyed on `enabled` too so an edit that flips it remounts the
              // row's optimistic toggle state from fresh props.
              <SourceRow key={`${r.id}-${r.enabled}`} source={r} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="email-alerts"
        title="Job alerts by email"
        icon={<Mail />}
        count={alertStats.filter((s) => s.alerts > 0).length}
        summary={emailAlertsSummary(alertStatViews, alertSourceView)}
        defaultOpen={false}
      >
        <EmailAlertsPanel stats={alertStatViews} source={alertSourceView} />
      </CollapsibleSection>

      <CollapsibleSection
        id="google-alerts"
        title="Google Alerts"
        icon={<Bell />}
        count={googleAlerts.queries.length}
        summary={
          ga
            ? `${ga.enabled ? 'On' : 'Paused'} · reading alert emails${ga.rssUrl ? ' and the RSS feed' : ''}${ga.lastError ? ' · last read failed' : ''}`
            : `Not set up · ${googleAlerts.queries.length} suggested ${googleAlerts.queries.length === 1 ? 'query' : 'queries'}`
        }
        defaultOpen={false}
      >
        <GoogleAlertsPanel queries={googleAlerts.queries} source={googleAlerts.source} />
      </CollapsibleSection>

      {employerRows.length > 0 ? (
        <CollapsibleSection
          id="employer-watch"
          title="GCC employer watch"
          icon={<Building2 />}
          count={employerRows.length}
          summary={watchSummary(employerRows)}
          defaultOpen={false}
        >
          <EmployerWatchPanel rows={employerRows} openCountries={searchPrefsFromProfile(profile).regions} />
        </CollapsibleSection>
      ) : null}

      {watch.length > 0 ? (
        <CollapsibleSection
          id="watch-list"
          title="Check these yourself"
          icon={<Eye />}
          count={watch.length}
          summary="Sites lee can't read; open them now and then"
          defaultOpen={false}
        >
          <WatchListPanel items={watch} />
        </CollapsibleSection>
      ) : null}

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
