import Link from 'next/link'
import { Plus } from 'lucide-react'
import { and, eq, gte } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { db } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'
import { Kanban, type KanbanCard } from '@/components/kanban'
import { NeedsAttention, type AttentionItem } from '@/components/needs-attention'
import { FreshDiscoveries, type FreshDiscoveryItem } from '@/components/fresh-discoveries'
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

export default async function DashboardPage() {
  const userId = await requireUserId()
  const rows = await appsQ.list(userId, {})
  const now = new Date()

  const freshRows = await db.query.discoveries.findMany({
    where: and(
      eq(discoveries.userId, userId),
      eq(discoveries.status, 'new'),
      gte(discoveries.createdAt, new Date(now.getTime() - FRESH_WINDOW_MS)),
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your pipeline at a glance."
        actions={
          <Button asChild size="sm">
            <Link href="/applications/new">
              <Plus className="size-4" />
              Add application
            </Link>
          </Button>
        }
      />
      <NeedsAttention items={attention} totalApplications={rows.length} />
      <FreshDiscoveries items={fresh} />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pipeline
        </h2>
        <Kanban columns={columns} />
      </section>
    </div>
  )
}
