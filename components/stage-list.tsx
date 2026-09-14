interface StageRow {
  id: string
  kind: string
  title: string | null
  scheduledAt: string | null
  status: string
}

interface StageListProps {
  applicationId: string
  stages: StageRow[]
}

export function StageList({ applicationId, stages }: StageListProps) {
  void applicationId
  return (
    <section>
      <h2 className="mb-2 font-medium">Interview stages</h2>
      {stages.length === 0 ? (
        <p className="text-sm text-neutral-500">None yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {stages.map((s) => (
            <li key={s.id} className="rounded border p-3">
              <div className="font-medium">{s.title ?? s.kind}</div>
              <div className="text-neutral-500">
                {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : 'unscheduled'} ·{' '}
                {s.status}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
