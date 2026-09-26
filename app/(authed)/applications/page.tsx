import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { ApplicationsTable } from '@/components/applications-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { BoardViewToggle } from '@/components/board/view-toggle'
import { Kanban, type KanbanColumn } from '@/components/kanban'
import { parseBoardView, viewHref } from '@/lib/board/view'
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/ui/status'

export const dynamic = 'force-dynamic'

interface ApplicationsPageProps {
  searchParams: Promise<{ status?: string | string[]; view?: string | string[] }>
}

function parseStatus(raw: string | string[] | undefined): 'all' | ApplicationStatus {
  if (typeof raw !== 'string') return 'all'
  return (APPLICATION_STATUSES as readonly string[]).includes(raw)
    ? (raw as ApplicationStatus)
    : 'all'
}

export default async function ApplicationsPage({ searchParams }: ApplicationsPageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  const initialFilter = parseStatus(params.status)
  const { view, explicit } = parseBoardView(params.view, 'list')
  const rows = await appsQ.list(userId, {})
  return (
    <div>
      <PageHeader
        title="Applications"
        description={`${rows.length} total`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BoardViewToggle
              page="applications"
              current={view}
              defaultView="list"
              explicit={explicit}
              boardHref={viewHref('/applications', params, 'board')}
              listHref={viewHref('/applications', params, 'list')}
            />
            <Button asChild size="sm" variant="outline">
              <a href="/api/applications/export">
                <Download className="size-4" />
                Export CSV
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href="/applications/new">
                <Plus className="size-4" />
                Add application
              </Link>
            </Button>
          </div>
        }
      />
      {view === 'board' ? (
        <Kanban columns={toBoardColumns(rows)} />
      ) : (
        <ApplicationsTable
          key={initialFilter}
          initialFilter={initialFilter}
          rows={rows.map((r) => ({
            id: r.id,
            status: r.status,
            interestLevel: r.interestLevel ?? null,
            appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
            nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
            job: {
              title: r.job.title,
              company: r.job.company ? { name: r.job.company.name } : null,
            },
          }))}
        />
      )}
    </div>
  )
}

/** Same rows as the table, grouped for the pipeline board (no extra query). */
function toBoardColumns(rows: Awaited<ReturnType<typeof appsQ.list>>): KanbanColumn[] {
  return APPLICATION_STATUSES.map((status) => ({
    status,
    cards: rows
      .filter((r) => (isApplicationStatus(r.status) ? r.status : 'saved') === status)
      .map((r) => ({
        id: r.id,
        title: r.job.title,
        companyName: r.job.company?.name ?? null,
        interestLevel: r.interestLevel ?? null,
        nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
      })),
  }))
}

function isApplicationStatus(s: string): s is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(s)
}
