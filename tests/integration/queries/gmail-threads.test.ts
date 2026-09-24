import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import * as q from '@/lib/db/queries/processedGmailThreads'
import * as applications from '@/lib/db/queries/applications'
import * as jobs from '@/lib/db/queries/jobs'
import * as companies from '@/lib/db/queries/companies'
import { db } from '@/lib/db/client'
import { processedGmailThreads } from '@/lib/db/schema'
import { makeUser } from '@/tests/factories'

async function seedApp(email = 'gm@x.com') {
  const u = await makeUser(email)
  const co = await companies.findOrCreateByDomain(u.id, 'gmailco.com', 'Gmail Co')
  const j = await jobs.upsertBySourceUrl(u.id, co.id, {
    title: 'Eng',
    sourceUrl: `https://gmailco.com/jobs/${email}`,
  })
  const app = await applications.create(u.id, { jobId: j.id })
  return { u, app }
}

describe('processedGmailThreads queries', () => {
  it('has() returns false for a thread that was never inserted', async () => {
    const { u } = await seedApp()
    expect(await q.has(u.id, 'thread-missing')).toBe(false)
  })

  it('markProcessed() inserts and has() then returns true', async () => {
    const { u, app } = await seedApp()
    await q.markProcessed(u.id, 'thread-a', app.id)
    expect(await q.has(u.id, 'thread-a')).toBe(true)

    const rows = await db
      .select()
      .from(processedGmailThreads)
      .where(eq(processedGmailThreads.userId, u.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.threadId).toBe('thread-a')
    expect(rows[0]?.matchedApplicationId).toBe(app.id)
  })

  it('markProcessed() supports unmatched threads (no application id)', async () => {
    const { u } = await seedApp()
    await q.markProcessed(u.id, 'thread-nomatch')
    const rows = await db
      .select()
      .from(processedGmailThreads)
      .where(eq(processedGmailThreads.userId, u.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.matchedApplicationId).toBeNull()
  })

  it('markProcessed() is idempotent — repeat calls do not error or duplicate rows', async () => {
    const { u, app } = await seedApp()
    await q.markProcessed(u.id, 'thread-x', app.id)
    // Second call with a different match value must be a no-op (first-write wins).
    await q.markProcessed(u.id, 'thread-x', null)
    const rows = await db
      .select()
      .from(processedGmailThreads)
      .where(eq(processedGmailThreads.userId, u.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.matchedApplicationId).toBe(app.id)
  })

  it('scopes rows per user — the same thread id under two users is two rows', async () => {
    const a = await seedApp('a@x.com')
    const b = await seedApp('b@x.com')
    await q.markProcessed(a.u.id, 'shared-thread', a.app.id)
    await q.markProcessed(b.u.id, 'shared-thread', b.app.id)
    expect(await q.has(a.u.id, 'shared-thread')).toBe(true)
    expect(await q.has(b.u.id, 'shared-thread')).toBe(true)
  })
})
