import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import * as stagesQ from '@/lib/db/queries/stages'
import { StatusPicker } from '@/components/status-picker'
import { StageList } from '@/components/stage-list'

export const dynamic = 'force-dynamic'

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user!.id
  const app = await appsQ.getById(userId, id)
  if (!app) notFound()
  const stages = await stagesQ.list(userId, id)
  const activities = await actQ.list(userId, id, { limit: 50 })
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">{app.job.title}</h1>
          <p className="text-sm text-neutral-500">{app.job.company?.name ?? '—'}</p>
        </div>
        <StatusPicker applicationId={app.id} current={app.status} />
      </header>
      <StageList
        applicationId={app.id}
        stages={stages.map((s) => ({
          id: s.id,
          kind: s.kind,
          title: s.title,
          scheduledAt: s.scheduledAt ? s.scheduledAt.toISOString() : null,
          status: s.status,
        }))}
      />
      <section>
        <h2 className="mb-2 font-medium">Activity</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-neutral-500">No activity yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {activities.map((a) => (
              <li key={a.id} className="border-l pl-3">
                <span className="text-neutral-500">
                  {new Date(a.createdAt).toLocaleString()}
                </span>{' '}
                — {a.kind} {JSON.stringify(a.payload)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
