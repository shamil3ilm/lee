import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import * as stagesQ from '@/lib/db/queries/stages'
import * as applicationContactsQ from '@/lib/db/queries/applicationContacts'
import { StatusPicker } from '@/components/status-picker'
import { StageList } from '@/components/stage-list'

export const dynamic = 'force-dynamic'

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const userId = await requireUserId()
  const app = await appsQ.getById(userId, id)
  if (!app) notFound()
  const stages = await stagesQ.list(userId, id)
  const activities = await actQ.list(userId, id, { limit: 50 })
  const contacts = await applicationContactsQ.listForApplication(userId, id)
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
        <h2 className="mb-2 font-medium">People (POCs)</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">None linked yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {contacts.map((c) => (
              <li key={`${c.id}-${c.role}`} className="rounded border px-3 py-2">
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-muted-foreground">{c.role}</span>
                {c.email ? <span className="ml-2 text-muted-foreground">· {c.email}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
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
