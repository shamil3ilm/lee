'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { saveGoogleAlertsAction } from '@/app/(authed)/settings/sources/google-alerts-actions'

interface GoogleAlertsPanelProps {
  queries: readonly string[]
  source: { enabled: boolean; rssUrl: string | null; lastError: string | null } | null
}

/**
 * Settings › Sources › Google Alerts: setup steps, suggested queries built
 * from the search preferences and watched employers (copy buttons), and the
 * optional RSS feed URL.
 */
export function GoogleAlertsPanel({ queries, source }: GoogleAlertsPanelProps) {
  const router = useRouter()
  const [rss, setRss] = useState(source?.rssUrl ?? '')
  const [pending, start] = useTransition()

  const copy = (q: string): void => {
    navigator.clipboard
      .writeText(q)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Could not copy. Select the text instead.'))
  }
  const save = (): void =>
    start(async () => {
      const r = await saveGoogleAlertsAction(rss)
      if ('error' in r) toast.error(r.error)
      else toast.success(source ? 'Google Alerts updated' : 'Google Alerts added')
      router.refresh()
    })

  return (
    <Card id="google-alerts" data-testid="google-alerts-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
          Google Alerts
        </CardTitle>
        <CardDescription>
          Google emails you new pages that match a search. lee reads those alerts in your Gmail (verified as sent by Google), or
          the alert’s RSS feed, and adds each job link to Discovery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Open{' '}
            <a href="https://www.google.com/alerts" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
              google.com/alerts <ExternalLink className="size-3" aria-hidden="true" />
            </a>{' '}
            and paste one of the queries below.
          </li>
          <li>Show options: How often “As-it-happens” or “At most once a day”; How many “Only the best results”.</li>
          <li>Deliver to: your Gmail address (the account lee reads), or “RSS feed” and paste the feed link below.</li>
          <li>Create alert. New results appear in Discovery after the next daily run.</li>
        </ol>
        <div className="space-y-1.5">
          <p className="font-medium">Suggested queries</p>
          <ul className="space-y-1" aria-label="Suggested Google Alerts queries">
            {queries.map((q) => (
              <li key={q} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1">
                <code className="min-w-0 break-all text-xs">{q}</code>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => copy(q)} aria-label={`Copy ${q}`}>
                  <Copy className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Built from your search preferences and watched employers; no personal details.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ga-rss" className="font-medium">
            RSS feed link (optional)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="ga-rss"
              value={rss}
              onChange={(e) => setRss(e.target.value)}
              placeholder="https://www.google.com/alerts/feeds/…"
              inputMode="url"
            />
            <Button type="button" onClick={save} disabled={pending}>
              {source ? 'Save' : 'Add Google Alerts'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {source
              ? `On${source.enabled ? '' : ' (paused)'}: reading alert emails${source.rssUrl ? ' and the RSS feed' : ''}.${source.lastError ? ` Last error: ${source.lastError}` : ''}`
              : 'Leave it empty to read alert emails only.'}{' '}
            The feed is read at most once a day.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
