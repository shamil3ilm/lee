import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { Kanban, type KanbanCard } from '@/components/kanban'
import { NeedsAttention, type AttentionItem } from '@/components/needs-attention'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  APPLICATION_STATUSES,
  isActiveStatus,
  type ApplicationStatus,
} from '@/lib/ui/status'

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

export default async function DashboardPage() {
  const userId = await requireUserId()
  const rows = await appsQ.list(userId, {})
  const now = new Date()

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
      <NeedsAttention items={attention} />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pipeline
        </h2>
        <Kanban columns={columns} />
      </section>
    </div>
  )
}
