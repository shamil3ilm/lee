import Link from 'next/link'
import { and, eq, gte, lte, isNotNull, desc } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/require-session'
import { db } from '@/lib/db/client'
import { applications, activities } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export default async function DigestPage() {
  const userId = await requireUserId()
  const now = new Date()
  const sevenDaysAhead = new Date(now.getTime() + 7 * DAY_MS)
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)

  const upcoming = await db.query.applications.findMany({
    where: and(
      eq(applications.userId, userId),
      isNotNull(applications.nextActionAt),
      lte(applications.nextActionAt, sevenDaysAhead),
    ),
    with: { job: { with: { company: true } } },
    orderBy: (a, { asc }) => asc(a.nextActionAt),
  })

  const recentActivities = await db
    .select({
      id: activities.id,
      createdAt: activities.createdAt,
      kind: activities.kind,
      payload: activities.payload,
      applicationId: activities.applicationId,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.createdAt, sevenDaysAgo)))
    .orderBy(desc(activities.createdAt))
    .limit(100)

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-xl font-semibold">Weekly digest</h1>

      <section>
        <h2 className="mb-2 font-medium">Actions due in the next 7 days</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {upcoming.map((a) => (
              <li key={a.id} className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Link href={`/applications/${a.id}`} className="font-medium underline">
                      {a.job.title}
                    </Link>
                    <div className="text-neutral-500">
                      {a.job.company?.name ?? '—'} · {a.status}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {a.nextActionAt ? new Date(a.nextActionAt).toLocaleString() : '—'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Recent activity (last 7 days)</h2>
        {recentActivities.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recentActivities.map((a) => (
              <li key={a.id} className="border-l pl-3">
                <span className="text-neutral-500">
                  {new Date(a.createdAt).toLocaleString()}
                </span>{' '}
                — <Link href={`/applications/${a.applicationId}`} className="underline">
                  {a.kind}
                </Link>{' '}
                {JSON.stringify(a.payload)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
