import Link from 'next/link'
import { Plus } from 'lucide-react'
import { and, count, eq, gte } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import * as todosQ from '@/lib/db/queries/todos'
import { db } from '@/lib/db/client'
import { accounts, activities, discoveries } from '@/lib/db/schema'
import { discoveryNotQuarantinedSql } from '@/lib/db/queries/riskAssessments'
import { getProfile } from '@/lib/profile/service'
import { Kanban, type KanbanCard } from '@/components/kanban'
import {
  NeedsAttention,
  type AttentionItem,
  type FollowupNudge,
  type TodoNudge,
} from '@/components/needs-attention'
import { FreshDiscoveries, type FreshDiscoveryItem } from '@/components/fresh-discoveries'
import { FunnelWidget } from '@/components/funnel-widget'
import { buildFunnelCounts } from '@/lib/dashboard/funnel'
import { SyncStatus } from '@/components/sync-status'
import { SetupChecklist } from '@/components/setup-checklist'
import { NextBestAction } from '@/components/next-best-action'
import { JourneyStrip } from '@/components/journey-strip'
import { DashboardSection } from '@/components/dashboard-section'
import { getJourneyCounts, getNextBestAction, getSetupChecklist } from '@/lib/journey/service'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  APPLICATION_STATUSES,
  isActiveStatus,
  type ApplicationStatus,
} from '@/lib/ui/status'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

export const dynamic = 'force-dynamic'

const ATTENTION_HORIZON_MS = 3 * 24 * 60 * 60 * 1000

type Row = Awaited<ReturnType<typeof appsQ.list>>[number]

function filterAttention(rows: Row[], cutoff: number): Row[] {
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

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const DAY_MS = 24 * 60 * 60 * 1000

// v4.2 — how far back to look for `followup_recommended` activities. Cron
// emits at most one per app per 24h; a week keeps the surface useful without
// dredging up nudges the user has already seen and ignored.
const FOLLOWUP_LOOKBACK_MS = 7 * DAY_MS

export default async function DashboardPage() {
  const userId = await requireUserId()
  const rows = await appsQ.list(userId, {})
  const now = new Date()

  // Sync-status widget inputs — one round-trip per input, all keyed by
  // userId so this stays cheap. Executed in parallel with the discovery
  // query and dashboard aggregations below.
  const [googleAccount, profile, emailCountRow, checklist, nextAction, journeyCounts] = await Promise.all([
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
          gte(activities.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      ),
    getSetupChecklist(userId),
    getNextBestAction(userId, now),
    getJourneyCounts(userId),
  ])
  const grantedScopes = googleAccount?.scope?.split(' ').filter(Boolean) ?? []
  const gmailConnected = grantedScopes.includes(GMAIL_SCOPE)
  const emailsToday = emailCountRow[0]?.c ?? 0

  const freshRows = await db.query.discoveries.findMany({
    where: and(
      eq(discoveries.userId, userId),
      eq(discoveries.status, 'new'),
      gte(discoveries.createdAt, new Date(now.getTime() - FRESH_WINDOW_MS)),
      // v17 §1 — likely-scam discoveries stay in quarantine, off the dashboard.
      discoveryNotQuarantinedSql(),
    ),
    orderBy: (d, { desc }) => [desc(d.matchScore), desc(d.createdAt)],
    limit: 5,
  })
  const fresh: FreshDiscoveryItem[] = freshRows.map((r) => {
    const n = r.normalized as unknown as NormalizedJob
    return {
      id: r.id,
      title: n.title ?? 'Untitled',
      companyName: n.companyName ?? 'Unknown',
      matchScore: r.matchScore,
    }
  })

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

  const columns = APPLICATION_STATUSES.map((status) => ({
    status,
    cards: grouped[status],
  }))

  const funnelCounts = buildFunnelCounts({
    saved: grouped.saved.length,
    applied: grouped.applied.length,
    screen: grouped.screen.length,
    interview: grouped.interview.length,
    offer: grouped.offer.length,
    rejected: grouped.rejected.length,
    withdrawn: grouped.withdrawn.length,
  })

  const attention: AttentionItem[] = filterAttention(
    rows,
    now.getTime() + ATTENTION_HORIZON_MS,
  ).map((r) => ({
    id: r.id,
    title: r.job.title,
    companyName: r.job.company?.name ?? null,
    status: r.status as ApplicationStatus,
    nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
  }))

  // v4.2 — pull the latest `followup_recommended` per application from the
  // last 7 days. Cron dedups within 24h so we typically get 1 row per app;
  // sorting desc + first-wins per applicationId picks the most recent bucket.
  const followupRows = await db
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
        gte(activities.createdAt, new Date(now.getTime() - FOLLOWUP_LOOKBACK_MS)),
      ),
    )
    .orderBy(activities.createdAt)
  // Reduce to latest-per-application; the query returns oldest→newest so the
  // last assignment wins.
  const rowsByAppId = new Map<string, (typeof followupRows)[number]>()
  for (const r of followupRows) rowsByAppId.set(r.applicationId, r)
  const rowById = new Map(rows.map((r) => [r.id, r] as const))
  const followups: FollowupNudge[] = []
  for (const [applicationId, row] of rowsByAppId) {
    const app = rowById.get(applicationId)
    if (!app) continue
    const payload = row.payload as {
      daysSince?: number
      suggestedInterval?: number
    }
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

  // v8 — today's todos (top 3 by priority, due today or overdue). One extra
  // round-trip; kept sequential so it can piggyback on the userId already
  // resolved above and to keep the code path readable.
  const endOfToday = new Date(now)
  endOfToday.setUTCHours(23, 59, 59, 999)
  const todayTodos = await todosQ.listDueByEnd(userId, endOfToday, 3)
  const todoNudges: TodoNudge[] = todayTodos.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    applicationId: t.applicationId,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description="Where you are in your search, and what to do next."
        actions={
          <Button asChild size="sm">
            <Link href="/applications/new">
              <Plus className="size-4" />
              Add application
            </Link>
          </Button>
        }
      />
      <SetupChecklist checklist={checklist} />
      <NextBestAction action={nextAction} />
      <JourneyStrip counts={journeyCounts} />
      <DashboardSection title="This week">
        <NeedsAttention
          items={attention}
          followups={followups}
          todos={todoNudges}
          totalApplications={rows.length}
          now={now.getTime()}
        />
      </DashboardSection>
      <DashboardSection title="Pipeline">
        <Kanban columns={columns} />
        <FunnelWidget counts={funnelCounts} />
      </DashboardSection>
      <DashboardSection title="Signals">
        <FreshDiscoveries items={fresh} />
        <SyncStatus
          connected={gmailConnected}
          syncedGmailAt={profile?.syncedGmailAt?.toISOString() ?? null}
          emailsToday={emailsToday}
          needsFollowUp={attention.length}
        />
      </DashboardSection>
    </div>
  )
}
