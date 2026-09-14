import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { Kanban, type KanbanCard } from '@/components/kanban'

export const dynamic = 'force-dynamic'

const STATUSES = [
  'saved',
  'applied',
  'screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const

export default async function DashboardPage() {
  const userId = await requireUserId()
  const rows = await appsQ.list(userId, {})

  const grouped: Record<string, KanbanCard[]> = {}
  for (const s of STATUSES) grouped[s] = []
  for (const r of rows) {
    const bucket = grouped[r.status] ?? grouped.saved
    bucket!.push({
      id: r.id,
      title: r.job.title,
      companyName: r.job.company?.name ?? null,
      nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
    })
  }

  const columns = STATUSES.map((status) => ({
    status,
    cards: grouped[status] ?? [],
  }))

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <Kanban columns={columns} />
    </div>
  )
}
