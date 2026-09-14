import { requireUserId } from '@/lib/auth/require-session'
import * as companiesQ from '@/lib/db/queries/companies'
import { AddCompanyDialog } from '@/components/add-company-dialog'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  const userId = await requireUserId()
  const rows = await companiesQ.listWatched(userId)
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Companies</h1>
        <AddCompanyDialog />
      </div>
      {rows.length === 0 ? (
        <p className="text-neutral-500">No watched companies yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded border p-3">
              <div className="font-medium">{c.name}</div>
              <div className="text-sm text-neutral-500">
                {c.domain ?? '—'} · {c.headquartersCountry ?? '—'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
