import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Disclosure } from '@/components/settings/disclosure'
import { ALERT_SITES } from '@/lib/email-alerts/sites'
import { relativeFromNow } from '@/lib/ui/date'

export interface EmailAlertSiteStat {
  site: string
  alerts: number
  jobsFound: number
  /** ISO string. */
  lastAlertAt: string | null
}

export interface EmailAlertsPanelProps {
  stats: EmailAlertSiteStat[]
  /** The user's `email_alert` source, if they have one. */
  source: { enabled: boolean; lastError: string | null } | null
}

/** "3 of 7 senders seen · last alert 2d ago" for the section header. */
export function emailAlertsSummary(stats: readonly EmailAlertSiteStat[], source: EmailAlertsPanelProps['source']): string {
  if (source === null) return 'Not set up'
  if (!source.enabled) return 'Switched off'
  if (source.lastError) return 'Last read failed'
  const seen = stats.filter((s) => s.alerts > 0).length
  const last = stats
    .map((s) => s.lastAlertAt)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1)
  return `${seen} of ${ALERT_SITES.length} senders seen${last ? ` · last alert ${relativeFromNow(last)}` : ''}`
}

/**
 * Settings › Sources › "Job alerts by email" (the section body): which alert
 * senders lee has seen in Gmail, when the last alert arrived, how many jobs
 * were read out of them, and how to create alerts on each site.
 */
export function EmailAlertsPanel({ stats, source }: EmailAlertsPanelProps) {
  const bySite = new Map(stats.map((s) => [s.site, s] as const))
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Indeed, LinkedIn, Naukri, NaukriGulf, Bayt, GulfTalent and Glassdoor have no public job API and don&apos;t allow
        scraping, but they email job alerts. lee reads those alerts from your Gmail once a day (read-only, only mail Google
        verified as sent by the site), keeps each job&apos;s title, company, location and link, and never stores the email.
      </p>
      {source === null ? (
        <p className="text-xs text-muted-foreground">
          Add the <strong>Job alerts by email</strong> source (Add source) to start reading alerts.
        </p>
      ) : !source.enabled ? (
        <p className="text-xs text-muted-foreground">The source is switched off under Your sources.</p>
      ) : source.lastError ? (
        <p className="text-xs text-danger">{source.lastError}</p>
      ) : null}
      <ul className="divide-y rounded-md border text-sm" aria-label="Alert senders">
        {ALERT_SITES.map((site) => {
          const s = bySite.get(site.id)
          return (
            <li key={site.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-28 font-medium">{site.label}</span>
              {s ? (
                <>
                  <Badge variant="success">Seen</Badge>
                  <span className="text-xs text-muted-foreground">
                    {s.alerts} {s.alerts === 1 ? 'alert' : 'alerts'} · {s.jobsFound} {s.jobsFound === 1 ? 'job' : 'jobs'} extracted
                    {s.lastAlertAt ? ` · last ${relativeFromNow(s.lastAlertAt)}` : ''}
                  </span>
                </>
              ) : (
                <Badge variant="neutral">No alerts yet</Badge>
              )}
            </li>
          )
        })}
      </ul>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Set up alerts (UAE / GCC / India · Backend, Full-stack · Junior–Mid)</h3>
        <ul className="divide-y rounded-md border text-sm">
          {ALERT_SITES.map((site) => (
            <li key={site.id} className="px-3 py-2">
              <Disclosure label={site.label} buttonClassName="text-sm font-medium text-foreground">
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  {site.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <a
                  href={site.alertsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                >
                  Open {site.label} <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </Disclosure>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
