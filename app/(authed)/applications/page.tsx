import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import { ApplicationsTable } from '@/components/applications-table'

export const dynamic = 'force-dynamic'

export default async function ApplicationsPage() {
  const userId = await requireUserId()
  const rows = await appsQ.list(userId, {})
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Applications</h1>
        <Link href="/applications/new" className="rounded bg-black px-3 py-2 text-white">
          + Add
        </Link>
      </div>
      <ApplicationsTable
        rows={rows.map((r) => ({
          id: r.id,
          status: r.status,
          job: {
            title: r.job.title,
            company: r.job.company ? { name: r.job.company.name } : null,
          },
          nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null,
        }))}
      />
    </div>
  )
}
