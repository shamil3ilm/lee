import Link from 'next/link'
import { Activity as ActivityIcon, CalendarClock } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { getUpcomingActions, getUpcomingStages, getRecentActivity } from '@/lib/digest/service'
import { buildDueActions } from '@/lib/digest/actions'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { relativeFromNow } from '@/lib/ui/date'
import { STATUS_BADGE, STATUS_LABELS } from '@/lib/ui/status'
import { LocalTime } from '@/components/local-time'
import { describeActivity, type ActivityDescription } from '@/lib/digest/activity-label'
import { joinMeta } from '@/lib/ui/meta'

export const dynamic = 'force-dynamic'

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
  const [upcoming, stages, recent] = await Promise.all([
    getUpcomingActions(userId, 7),
    getUpcomingStages(userId, 7),
    getRecentActivity(userId, 7),
  ])
  const due = buildDueActions(
    upcoming.map((a) => ({
      applicationId: a.id,
      status: a.status,
      nextActionAt: a.nextActionAt,
      companyName: a.job.company?.name ?? null,
      jobTitle: a.job.title,
    })),
    stages,
    new Date(),
  )

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
          <Badge variant="secondary">{due.length}</Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {due.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y" data-testid="digest-actions">
              {due.map((a) => (
                <li key={a.key}>
                  <Link
                    href={`/applications/${a.applicationId}`}
                    className="flex items-start justify-between gap-3 py-2 hover:bg-accent/40 sm:px-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm">
                        <span className="font-medium">{a.action}</span>
                        <span className="text-muted-foreground"> · </span>
                        {a.overdue ? (
                          <span className="font-medium text-danger">overdue</span>
                        ) : (
                          <LocalTime date={a.at} format={a.kind === 'stage' ? 'datetime' : 'date'} />
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {joinMeta([a.companyName ?? 'Unknown company', a.jobTitle])}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.overdue ? <LocalTime date={a.at} format="date" /> : relativeFromNow(a.at)}
                    </span>
                  </Link>
                </li>
              ))}
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
