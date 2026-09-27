import { ExternalLink, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
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

/**
 * Settings › Sources › "Job alerts by email": which alert senders lee has
 * seen in Gmail, when the last alert arrived, how many jobs were read out
 * of them, and how to create alerts on each site.
 */
export function EmailAlertsPanel({ stats, source }: EmailAlertsPanelProps) {
  const bySite = new Map(stats.map((s) => [s.site, s] as const))
  return (
    <section id="email-alerts" aria-labelledby="email-alerts-title" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <h2 id="email-alerts-title" className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <Mail className="size-4 text-primary" />
            Job alerts by email
          </h2>
          <CardDescription>
            Indeed, LinkedIn, Naukri, NaukriGulf, Bayt, GulfTalent and Glassdoor offer no public job
            API and don&apos;t allow scraping, but they will email you job alerts. lee reads those
            alerts from your Gmail once a day (read-only), keeps only each job&apos;s title, company,
            location and link, and never stores the email itself. Only mail that Google verified
            as really sent by the site is read.
          </CardDescription>
          {source === null ? (
            <p className="text-xs text-muted-foreground">
              Add the <strong>Job alerts by email</strong> source (Add source) to start reading alerts.
            </p>
          ) : !source.enabled ? (
            <p className="text-xs text-muted-foreground">The source is switched off in the list below.</p>
          ) : source.lastError ? (
            <p className="text-xs text-danger">{source.lastError}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-md border text-sm" aria-label="Alert senders">
            {ALERT_SITES.map((site) => {
              const s = bySite.get(site.id)
              return (
                <li key={site.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="w-28 font-medium">{site.label}</span>
                  {s ? (
                    <>
                      <Badge variant="emerald">Seen</Badge>
                      <span className="text-xs text-muted-foreground">
                        {s.alerts} alert{s.alerts === 1 ? '' : 's'} · {s.jobsFound} job
                        {s.jobsFound === 1 ? '' : 's'} extracted
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
            {ALERT_SITES.map((site) => (
              <details key={site.id} className="rounded-md border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">{site.label}</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
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
                  Open {site.label} <ExternalLink className="size-3" />
                </a>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
