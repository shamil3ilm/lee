import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { LocalTime } from '@/components/local-time'
import type { HiringPostsPanelData, ParserHealth } from '@/lib/linkedin-posts/panel-data'
import { BOOKMARKLET_STEPS, EMAIL_SETUP_STEPS, MOBILE_STEPS } from '@/lib/linkedin-posts/setup'
import { BookmarkletLink, HiringPostsToggle } from './hiring-posts-controls'

/**
 * Settings › LinkedIn › Hiring posts: setup steps for the LinkedIn emails,
 * on/off and Check now, the latest sync's counts and the parser's health,
 * and the "Send to lee" bookmarklet. lee never opens linkedin.com.
 */

const HEALTH: Readonly<Record<ParserHealth, { label: string; variant: 'neutral' | 'success' | 'warning' | 'info'; note: string }>> = {
  off: { label: 'Off', variant: 'neutral', note: 'Turn it on to read your LinkedIn post emails on every discovery run.' },
  waiting: { label: 'Waiting for emails', variant: 'info', note: 'No LinkedIn post emails in the last week yet. Check the notification settings below.' },
  ok: { label: 'Reading fine', variant: 'success', note: 'Recent LinkedIn emails were read.' },
  degraded: {
    label: 'Format changed?',
    variant: 'warning',
    note: 'Several recent LinkedIn emails could not be read; LinkedIn may have changed their layout. Paste posts by hand meanwhile.',
  },
}

function Steps({ steps, label }: { steps: readonly string[]; label: string }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground [overflow-wrap:anywhere]" aria-label={label}>
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  )
}

export function HiringPostsSection({ data }: { data: HiringPostsPanelData }) {
  const health = HEALTH[data.health]
  return (
    <div className="space-y-5" data-testid="hiring-posts-panel">
      <p className="text-sm text-muted-foreground">
        Recruiters across the GCC post openings (“We’re hiring a Laravel developer in Dubai, send your CV to …”) instead
        of listing them. lee finds those posts in LinkedIn’s own emails to you, or in posts you paste or send with the
        bookmarklet, and adds the hiring ones to{' '}
        <Link href="/discoveries?posts=1" className="underline">
          Discovery › Hiring posts
        </Link>
        . It never opens, scrolls or reads LinkedIn itself, and never messages anyone.
      </p>

      <HiringPostsToggle enabled={data.enabled} />

      <div className="space-y-2 rounded-lg border p-3" aria-labelledby="hiring-posts-status">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="hiring-posts-status" className="text-sm font-semibold">
            Latest sync
          </h3>
          <Badge variant={health.variant} data-testid="hiring-posts-health">
            {health.label}
          </Badge>
          {data.lastPolledAt ? (
            <span className="text-xs text-muted-foreground">
              checked <LocalTime date={data.lastPolledAt} format="relative" />
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{health.note}</p>
        {data.lastError ? (
          <p className="text-sm text-danger" role="alert">
            {data.lastError}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid="hiring-posts-counts">
          <div>
            <dt className="text-xs text-muted-foreground">Emails read</dt>
            <dd className="font-medium">{data.totals.emails}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Posts seen</dt>
            <dd className="font-medium">{data.totals.posts}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Hiring posts</dt>
            <dd className="font-medium">{data.totals.hiring}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Unreadable emails</dt>
            <dd className="font-medium">{data.totals.failed}</dd>
          </div>
        </dl>
        {data.enabled && data.lastRun ? (
          <p className="text-xs text-muted-foreground">
            Last run: {data.lastRun.fetched} hiring post{data.lastRun.fetched === 1 ? '' : 's'} found · {data.lastRun.new} new
            {data.lastRun.parseFailures > 0 ? ` · ${data.lastRun.parseFailures} unreadable` : ''}. Counts cover the last 120 days.
          </p>
        ) : null}
      </div>

      <section className="space-y-2" aria-labelledby="hiring-posts-email-setup">
        <h3 id="hiring-posts-email-setup" className="text-sm font-semibold">
          1. Get LinkedIn to email you posts
        </h3>
        <Steps steps={EMAIL_SETUP_STEPS} label="Turn on LinkedIn post emails" />
        <p className="text-xs text-muted-foreground">
          LinkedIn renames these settings from time to time; look for the email switch next to network updates and posts.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="hiring-posts-bookmarklet">
        <h3 id="hiring-posts-bookmarklet" className="text-sm font-semibold">
          2. Send a post you are reading to lee
        </h3>
        <Steps steps={BOOKMARKLET_STEPS} label="Use the Send to lee bookmarklet" />
        <BookmarkletLink href={data.bookmarklet} />
        <p className="text-xs text-muted-foreground">
          The bookmark carries a private key for your account: don’t share it. If it leaks, make a new one.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="hiring-posts-mobile">
        <h3 id="hiring-posts-mobile" className="text-sm font-semibold">
          3. On your phone
        </h3>
        <Steps steps={MOBILE_STEPS} label="Add a post from your phone" />
      </section>
    </div>
  )
}
