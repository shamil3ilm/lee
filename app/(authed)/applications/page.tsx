import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { ApplicationsTable } from '@/components/applications-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function ApplicationsPage() {
  const userId = await requireUserId()
  const rows = await appsQ.list(userId, {})
  return (
    <div>
      <PageHeader
        title="Applications"
        description={`${rows.length} total`}
        actions={
          <Button asChild size="sm">
            <Link href="/applications/new">
              <Plus className="size-4" />
              Add application
            </Link>
          </Button>
        }
      />
      <ApplicationsTable
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
