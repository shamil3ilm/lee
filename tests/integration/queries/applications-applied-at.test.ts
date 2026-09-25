import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications } from '@/lib/db/schema'
import * as appsQ from '@/lib/db/queries/applications'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

describe('setAppliedAt', () => {
  it('updates applied_at and writes an activity row', async () => {
    const u = await makeUser('backfill-1@x.com')
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id, { status: 'applied' })

    expect(a.appliedAt).toBeNull()
    const when = new Date('2025-11-10T00:00:00Z')
    const updated = await appsQ.setAppliedAt(u.id, a.id, when)
    expect(updated?.appliedAt?.toISOString()).toBe(when.toISOString())

    const after = await db.query.applications.findFirst({
      where: eq(applications.id, a.id),
    })
    expect(after?.appliedAt?.toISOString()).toBe(when.toISOString())

    const acts = await db
      .select()
      .from(activities)
      .where(and(eq(activities.applicationId, a.id), eq(activities.kind, 'applied_at_set')))
    expect(acts).toHaveLength(1)
    const payload = acts[0]?.payload as { from: string | null; to: string }
    expect(payload.to).toBe(when.toISOString())
  })

  it('returns undefined when the id does not belong to the caller', async () => {
    const u1 = await makeUser('backfill-scope-1@x.com')
    const u2 = await makeUser('backfill-scope-2@x.com')
    const c = await makeCompany(u2.id)
    const j = await makeJob(u2.id, c.id)
    const a = await makeApplication(u2.id, j.id, { status: 'applied' })

    const updated = await appsQ.setAppliedAt(u1.id, a.id, new Date())
    expect(updated).toBeUndefined()

    const after = await db.query.applications.findFirst({
      where: eq(applications.id, a.id),
    })
    expect(after?.appliedAt).toBeNull()
  })
})
