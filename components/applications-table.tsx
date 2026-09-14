'use client'
import Link from 'next/link'

interface Row {
  id: string
  status: string
  job: { title: string; company?: { name: string } | null }
  nextActionAt?: string | null
}

interface ApplicationsTableProps {
  rows: Row[]
}

export function ApplicationsTable({ rows }: ApplicationsTableProps) {
  if (rows.length === 0) return <p className="text-neutral-500">No applications yet.</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left">
        <tr>
          <th className="py-2">Company</th>
          <th className="py-2">Role</th>
          <th className="py-2">Status</th>
          <th className="py-2">Next action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="py-2">{r.job.company?.name ?? '—'}</td>
            <td>
              <Link className="underline" href={`/applications/${r.id}`}>
                {r.job.title}
              </Link>
            </td>
            <td>{r.status}</td>
            <td>{r.nextActionAt ? new Date(r.nextActionAt).toLocaleDateString() : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
