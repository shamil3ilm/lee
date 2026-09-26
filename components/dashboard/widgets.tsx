import { cache } from 'react'
import { and, count, eq, gte } from 'drizzle-orm'
import * as appsQ from '@/lib/db/queries/applications'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import * as todosQ from '@/lib/db/queries/todos'
import { db } from '@/lib/db/client'
import { accounts, activities } from '@/lib/db/schema'
import { mapForTargets } from '@/lib/db/queries/riskAssessments'
import { toRiskView } from '@/lib/scam/view'
import { getProfile } from '@/lib/profile/service'
import { getJourneyCounts, getNextBestAction, getSetupChecklist } from '@/lib/journey/service'
import { buildFunnelCounts } from '@/lib/dashboard/funnel'
import { Kanban, type KanbanCard } from '@/components/kanban'
import {
  NeedsAttention,
  type AttentionItem,
  type FollowupNudge,
  type TodoNudge,
} from '@/components/needs-attention'
import { FreshDiscoveries, type FreshDiscoveryItem } from '@/components/fresh-discoveries'
import { FunnelWidget } from '@/components/funnel-widget'
import { SyncStatus } from '@/components/sync-status'
import { SetupChecklist } from '@/components/setup-checklist'
import { NextBestAction } from '@/components/next-best-action'
import { JourneyStrip } from '@/components/journey-strip'
import { Skeleton } from '@/components/ui/skeleton'
import {
  APPLICATION_STATUSES,
  isActiveStatus,
  type ApplicationStatus,
} from '@/lib/ui/status'

/**
 * Dashboard widgets as independent async server components. The page wraps
 * each in <Suspense> so the shell streams immediately and every widget
 * resolves on its own; shared inputs go through React `cache()` so they are
 * fetched once per request no matter how many widgets read them.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const ATTENTION_HORIZON_MS = 3 * DAY_MS
const FRESH_WINDOW_MS = DAY_MS
// v4.2 — how far back to look for `followup_recommended` activities. Cron
// emits at most one per app per 24h; a week keeps the surface useful without
// dredging up nudges the user has already seen and ignored.
const FOLLOWUP_LOOKBACK_MS = 7 * DAY_MS
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

type Row = appsQ.ApplicationListRow

export interface WidgetProps {
  userId: string
  /** Request-time snapshot (ms) so every widget agrees on "now". */
  now: number
}

/** Lean application rows, shared by the pipeline / this-week / signals widgets. */
const loadApplications = cache((userId: string): Promise<Row[]> => appsQ.list(userId, {}))

function attentionRows(rows: Row[], now: number): Row[] {
  const cutoff = now + ATTENTION_HORIZON_MS
  return rows
    .filter(
      (r) =>
        isActiveStatus(r.status) &&
        r.nextActionAt !== null &&
        r.nextActionAt.getTime() <= cutoff,
    )
    .sort((a, b) => a.nextActionAt!.getTime() - b.nextActionAt!.getTime())
    .slice(0, 10)
}

export async function SetupChecklistWidget({ userId }: Pick<WidgetProps, 'userId'>) {
  return <SetupChecklist checklist={await getSetupChecklist(userId)} />
}

export async function NextBestActionWidget({ userId, now }: WidgetProps) {
  return <NextBestAction action={await getNextBestAction(userId, new Date(now))} />
}

export async function JourneyStripWidget({ userId }: Pick<WidgetProps, 'userId'>) {
  return <JourneyStrip counts={await getJourneyCounts(userId)} />
}

export async function ThisWeekWidget({ userId, now }: WidgetProps) {
  const endOfToday = new Date(now)
  endOfToday.setUTCHours(23, 59, 59, 999)
  const [rows, followupRows, todayTodos] = await Promise.all([
    loadApplications(userId),
    // v4.2 — latest `followup_recommended` per application from the last 7
    // days. Oldest→newest so the last assignment per app wins below.
    db
      .select({
        applicationId: activities.applicationId,
        payload: activities.payload,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.kind, 'followup_recommended'),
          gte(activities.createdAt, new Date(now - FOLLOWUP_LOOKBACK_MS)),
        ),
      )
      .orderBy(activities.createdAt),
    // v8 — today's todos (top 3 by priority, due today or overdue).
    todosQ.listDueByEnd(userId, endOfToday, 3),
  ])

  const attention: AttentionItem[] = attentionRows(rows, now).map((r) => ({
    id: r.id,
    title: r.job.title,
    companyName: r.job.company?.name ?? null,
    status: r.status as ApplicationStatus,
    nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
  }))

  const latestByApp = new Map<string, (typeof followupRows)[number]>()
  for (const r of followupRows) latestByApp.set(r.applicationId, r)
  const rowById = new Map(rows.map((r) => [r.id, r] as const))
  const followups: FollowupNudge[] = []
  for (const [applicationId, row] of latestByApp) {
    const app = rowById.get(applicationId)
    if (!app) continue
    const payload = row.payload as { daysSince?: number; suggestedInterval?: number }
    const interval = payload?.suggestedInterval
    if (interval !== 7 && interval !== 14 && interval !== 21 && interval !== 30) continue
    followups.push({
      applicationId,
      jobTitle: app.job.title,
      companyName: app.job.company?.name ?? null,
      daysSince: payload?.daysSince ?? interval,
      suggestedInterval: interval,
      recommendedAt: row.createdAt.toISOString(),
    })
  }

  const todoNudges: TodoNudge[] = todayTodos.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    applicationId: t.applicationId,
  }))

  return (
    <NeedsAttention
      items={attention}
      followups={followups}
      todos={todoNudges}
      totalApplications={rows.length}
      now={now}
    />
  )
}

export async function PipelineWidget({ userId }: Pick<WidgetProps, 'userId'>) {
  const rows = await loadApplications(userId)
  const grouped: Record<ApplicationStatus, KanbanCard[]> = {
    saved: [],
    applied: [],
    screen: [],
    interview: [],
    offer: [],
    rejected: [],
    withdrawn: [],
  }
  for (const r of rows) {
    const status = (APPLICATION_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as ApplicationStatus)
      : 'saved'
    grouped[status].push({
      id: r.id,
      title: r.job.title,
      companyName: r.job.company?.name ?? null,
      interestLevel: r.interestLevel ?? null,
      nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
    })
  }
  const columns = APPLICATION_STATUSES.map((status) => ({ status, cards: grouped[status] }))
  const funnelCounts = buildFunnelCounts({
    saved: grouped.saved.length,
    applied: grouped.applied.length,
    screen: grouped.screen.length,
    interview: grouped.interview.length,
    offer: grouped.offer.length,
    rejected: grouped.rejected.length,
    withdrawn: grouped.withdrawn.length,
  })
  return (
    <>
      <Kanban columns={columns} />
      <FunnelWidget counts={funnelCounts} />
    </>
  )
}

export async function SignalsWidget({ userId, now }: WidgetProps) {
  const [freshRows, googleAccount, profile, emailCountRow, rows] = await Promise.all([
    // v17 §1 — likely-scam discoveries stay in quarantine (list() excludes
    // them by default), off the dashboard. Lean rows: no raw/normalized.
    discoveriesQ.list(userId, {
      status: 'new',
      createdAfter: new Date(now - FRESH_WINDOW_MS),
      sort: 'match',
      limit: 5,
    }),
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
      columns: { scope: true },
    }),
    getProfile(userId),
    db
      .select({ c: count() })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.kind, 'email'),
          gte(activities.createdAt, new Date(now - DAY_MS)),
        ),
      ),
    loadApplications(userId),
  ])
  const freshRisks = await mapForTargets(userId, 'discovery', freshRows.map((r) => r.id))
  const fresh: FreshDiscoveryItem[] = freshRows.map((r) => {
    const risk = freshRisks.get(r.id)
    return {
      id: r.id,
      title: r.title ?? 'Untitled',
      companyName: r.companyName ?? 'Unknown',
      matchScore: r.matchScore,
      risk: risk ? toRiskView(risk) : null,
    }
  })
  const grantedScopes = googleAccount?.scope?.split(' ').filter(Boolean) ?? []
  return (
    <>
      <FreshDiscoveries items={fresh} />
      <SyncStatus
        connected={grantedScopes.includes(GMAIL_SCOPE)}
        syncedGmailAt={profile?.syncedGmailAt?.toISOString() ?? null}
        emailsToday={emailCountRow[0]?.c ?? 0}
        needsFollowUp={attentionRows(rows, now).length}
      />
    </>
  )
}

/** Skeleton placeholder for a streaming widget. */
export function WidgetSkeleton({ className = 'h-24' }: { className?: string }) {
  return <Skeleton className={`w-full ${className}`} />
}
