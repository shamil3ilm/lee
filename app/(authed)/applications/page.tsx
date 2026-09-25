import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { ApplicationsTable } from '@/components/applications-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/ui/status'

export const dynamic = 'force-dynamic'

interface ApplicationsPageProps {
  searchParams: Promise<{ status?: string | string[] }>
}

function parseStatus(raw: string | string[] | undefined): 'all' | ApplicationStatus {
  if (typeof raw !== 'string') return 'all'
  return (APPLICATION_STATUSES as readonly string[]).includes(raw)
    ? (raw as ApplicationStatus)
    : 'all'
}

export default async function ApplicationsPage({ searchParams }: ApplicationsPageProps) {
  const userId = await requireUserId()
  const initialFilter = parseStatus((await searchParams).status)
  const rows = await appsQ.list(userId, {})
  return (
    <div>
      <PageHeader
        title="Applications"
        description={`${rows.length} total`}
        actions={
          <div className="flex items-center gap-2">
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
    </div>
  )
}
