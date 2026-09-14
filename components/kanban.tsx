import Link from 'next/link'

export interface KanbanCard {
  id: string
  title: string
  companyName: string | null
  nextActionAt: string | null
}

export interface KanbanColumn {
  status: string
  cards: KanbanCard[]
}

interface KanbanProps {
  columns: KanbanColumn[]
}

export function Kanban({ columns }: KanbanProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div
          key={col.status}
          className="min-w-[240px] flex-1 rounded border bg-neutral-50 p-2 dark:bg-neutral-900"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-medium capitalize">{col.status}</span>
            <span className="text-xs text-neutral-500">{col.cards.length}</span>
          </div>
          <div className="space-y-2">
            {col.cards.length === 0 ? (
              <div className="rounded border border-dashed p-2 text-center text-xs text-neutral-400">
                empty
              </div>
            ) : (
              col.cards.map((c) => (
                <Link
                  key={c.id}
                  href={`/applications/${c.id}`}
                  className="block rounded border bg-white p-2 text-sm shadow-sm hover:border-black dark:bg-neutral-800"
                >
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-neutral-500">{c.companyName ?? '—'}</div>
                  {c.nextActionAt && (
                    <div className="mt-1 text-xs text-neutral-400">
                      Next: {new Date(c.nextActionAt).toLocaleDateString()}
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
