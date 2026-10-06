import Link from 'next/link'
import { Activity as ActivityIcon, CalendarClock } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { getUpcomingActions, getRecentActivity } from '@/lib/digest/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { relativeFromNow } from '@/lib/ui/date'
import {
  APPLICATION_STATUSES,
  STATUS_BADGE,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'
import { LocalTime } from '@/components/local-time'
import { describeActivity, type ActivityDescription } from '@/lib/digest/activity-label'
import { joinMeta } from '@/lib/ui/meta'

export const dynamic = 'force-dynamic'

function narrow(s: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s)
    ? (s as ApplicationStatus)
    : 'saved'
}

/** "Applied → Interview" with status badges, or a short phrase for other kinds. */
function ActivityChange({ description }: { description: ActivityDescription }) {
  if (description.type === 'text') {
    return <span className="text-xs text-muted-foreground">{description.text}</span>
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {description.from ? (
        <>
          <Badge variant={STATUS_BADGE[description.from]} className="text-[10px]">
            {STATUS_LABELS[description.from]}
          </Badge>
          <span aria-label="to">→</span>
        </>
      ) : (
        <span>Added as</span>
      )}
      <Badge variant={STATUS_BADGE[description.to]} className="text-[10px]">
        {STATUS_LABELS[description.to]}
      </Badge>
    </span>
  )
}

export default async function DigestPage() {
  const userId = await requireUserId()
  const [upcoming, recent] = await Promise.all([
    getUpcomingActions(userId, 7),
    getRecentActivity(userId, 7),
  ])

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Weekly digest"
        description="What's happening in the next 7 days."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            <CardTitle>Actions due (7 days)</CardTitle>
          </div>
          <Badge variant="secondary">{upcoming.length}</Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((a) => {
                const status = narrow(a.status)
                return (
                  <li key={a.id}>
                    <Link
                      href={`/applications/${a.id}`}
                      className="flex items-center justify-between gap-3 py-2 hover:bg-accent/40 sm:px-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {a.job.company?.name ?? 'Unknown'}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.job.title}
                        </div>
                      </div>
                      <div className="hidden text-right text-xs text-muted-foreground sm:block">
                        {a.nextActionAt ? (
                          <>
                            <div className="font-medium text-foreground">
                              {relativeFromNow(a.nextActionAt)}
                            </div>
                            <div><LocalTime date={a.nextActionAt} /></div>
                          </>
                        ) : null}
                      </div>
                      <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-4 text-muted-foreground" />
            <CardTitle>Recent activity (7 days)</CardTitle>
          </div>
          <Badge variant="secondary">{recent.length}</Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="shrink-0 text-xs text-muted-foreground sm:w-32">
                    <LocalTime date={a.createdAt} />
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/applications/${a.applicationId}`}
                      className="min-w-0 truncate font-medium hover:underline"
                    >
                      {joinMeta([a.companyName, a.jobTitle]) || 'Application'}
                    </Link>
                    <ActivityChange description={describeActivity(a.kind, a.payload)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
