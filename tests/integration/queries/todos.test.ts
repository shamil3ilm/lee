import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/todos'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const H = 60 * 60 * 1000

describe('todos queries', () => {
  it('create inserts and scopes by userId with defaults', async () => {
    const u = await makeUser('td1@x.com')
    const row = await q.create(u.id, { title: 'Reply to Nadia' })
    expect(row.userId).toBe(u.id)
    expect(row.title).toBe('Reply to Nadia')
    expect(row.status).toBe('open')
    expect(row.priority).toBe(0)
    expect(row.tags).toEqual([])
  })

  it('create stores linked application id', async () => {
    const u = await makeUser('td-link@x.com')
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)
    const row = await q.create(u.id, { title: 'Send CV', applicationId: a.id })
    expect(row.applicationId).toBe(a.id)
  })

  it('list is scoped by userId', async () => {
    const u = await makeUser('td-scope@x.com')
    const other = await makeUser('td-other@x.com')
    await q.create(u.id, { title: 'mine' })
    expect(await q.list(other.id)).toHaveLength(0)
    expect(await q.list(u.id)).toHaveLength(1)
  })

  it('list filters by status', async () => {
    const u = await makeUser('td-status@x.com')
    await q.create(u.id, { title: 'a', status: 'open' })
    await q.create(u.id, { title: 'b', status: 'done' })
    await q.create(u.id, { title: 'c', status: 'archived' })
    expect(await q.list(u.id, { status: 'open' })).toHaveLength(1)
    expect(await q.list(u.id, { status: 'done' })).toHaveLength(1)
    expect(await q.list(u.id, { status: 'archived' })).toHaveLength(1)
  })

  it('list filters by applicationId', async () => {
    const u = await makeUser('td-app@x.com')
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)
    await q.create(u.id, { title: 'linked', applicationId: a.id })
    await q.create(u.id, { title: 'free' })
    const linked = await q.list(u.id, { applicationId: a.id })
    expect(linked).toHaveLength(1)
    expect(linked[0]?.title).toBe('linked')
  })

  it('list dueWithin includes overdue and next-24h', async () => {
    const u = await makeUser('td-due@x.com')
    const now = new Date('2026-09-25T10:00:00Z')
    await q.create(u.id, { title: 'yesterday', dueAt: new Date(now.getTime() - 24 * H) })
    await q.create(u.id, { title: 'in 2h', dueAt: new Date(now.getTime() + 2 * H) })
    await q.create(u.id, { title: 'in 3 days', dueAt: new Date(now.getTime() + 3 * 24 * H) })
    await q.create(u.id, { title: 'no due date' })
    const soon = await q.list(u.id, { dueWithin: { hours: 24, now } })
    const titles = soon.map((r) => r.title).sort()
    expect(titles).toEqual(['in 2h', 'yesterday'])
  })

  it('list filters by tag', async () => {
    const u = await makeUser('td-tag@x.com')
    await q.create(u.id, { title: 'a', tags: ['urgent', 'ops'] })
    await q.create(u.id, { title: 'b', tags: ['ops'] })
    await q.create(u.id, { title: 'c', tags: [] })
    const urgent = await q.list(u.id, { tag: 'urgent' })
    expect(urgent.map((r) => r.title)).toEqual(['a'])
    const ops = await q.list(u.id, { tag: 'ops' })
    expect(ops.map((r) => r.title).sort()).toEqual(['a', 'b'])
  })

  it('list default sort surfaces overdue first', async () => {
    const u = await makeUser('td-sort@x.com')
    const now = Date.now()
    await q.create(u.id, { title: 'later', dueAt: new Date(now + 3 * 24 * H) })
    await q.create(u.id, { title: 'overdue', dueAt: new Date(now - 24 * H) })
    await q.create(u.id, { title: 'nodue', priority: 3 })
    const rows = await q.list(u.id)
    expect(rows.map((r) => r.title)).toEqual(['overdue', 'later', 'nodue'])
  })

  it('update patches fields and refreshes updatedAt', async () => {
    const u = await makeUser('td-upd@x.com')
    const row = await q.create(u.id, { title: 'a' })
    const updated = await q.update(u.id, row.id, { title: 'b', priority: 2 })
    expect(updated?.title).toBe('b')
    expect(updated?.priority).toBe(2)
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime())
  })

  it('update returns null for missing / other-user rows', async () => {
    const u = await makeUser('td-upd2@x.com')
    const row = await q.create(u.id, { title: 'a' })
    const other = await makeUser('td-upd2-other@x.com')
    expect(await q.update(other.id, row.id, { title: 'b' })).toBeNull()
  })

  it('markDone sets status + completedAt', async () => {
    const u = await makeUser('td-done@x.com')
    const row = await q.create(u.id, { title: 'a' })
    const done = await q.markDone(u.id, row.id)
    expect(done?.status).toBe('done')
    expect(done?.completedAt).toBeInstanceOf(Date)
  })

  it('toggleStatus flips open ↔ done and manages completedAt', async () => {
    const u = await makeUser('td-toggle@x.com')
    const row = await q.create(u.id, { title: 'a' })
    const done = await q.toggleStatus(u.id, row.id)
    expect(done?.status).toBe('done')
    expect(done?.completedAt).toBeInstanceOf(Date)
    const reopened = await q.toggleStatus(u.id, row.id)
    expect(reopened?.status).toBe('open')
    expect(reopened?.completedAt).toBeNull()
  })

  it('toggleStatus is a no-op when archived', async () => {
    const u = await makeUser('td-archived@x.com')
    const row = await q.create(u.id, { title: 'a', status: 'archived' })
    const same = await q.toggleStatus(u.id, row.id)
    expect(same?.status).toBe('archived')
  })

  it('remove deletes only owner row', async () => {
    const u = await makeUser('td-rm@x.com')
    const other = await makeUser('td-rm-other@x.com')
    const row = await q.create(u.id, { title: 'a' })
    await q.remove(other.id, row.id) // wrong user — no effect
    expect(await q.getById(u.id, row.id)).not.toBeNull()
    await q.remove(u.id, row.id)
    expect(await q.getById(u.id, row.id)).toBeNull()
  })

  it('listDueByEnd returns overdue + today open todos ordered by priority desc', async () => {
    const u = await makeUser('td-today@x.com')
    const end = new Date('2026-09-25T23:59:59Z')
    await q.create(u.id, {
      title: 'low priority overdue',
      dueAt: new Date('2026-09-24T00:00:00Z'),
      priority: 1,
    })
    await q.create(u.id, {
      title: 'high priority today',
      dueAt: new Date('2026-09-25T14:00:00Z'),
      priority: 3,
    })
    // Not due (future) — excluded.
    await q.create(u.id, { title: 'tomorrow', dueAt: new Date('2026-09-26T10:00:00Z') })
    // Done — excluded.
    await q.create(u.id, {
      title: 'done',
      dueAt: new Date('2026-09-25T10:00:00Z'),
      status: 'done',
    })
    const rows = await q.listDueByEnd(u.id, end)
    expect(rows.map((r) => r.title)).toEqual([
      'high priority today',
      'low priority overdue',
    ])
  })

  it('listDueBetween filters by [start, end]', async () => {
    const u = await makeUser('td-between@x.com')
    const start = new Date('2026-09-25T00:00:00Z')
    const end = new Date('2026-09-26T00:00:00Z')
    await q.create(u.id, { title: 'inside', dueAt: new Date('2026-09-25T10:00:00Z') })
    await q.create(u.id, { title: 'outside', dueAt: new Date('2026-09-27T10:00:00Z') })
    const rows = await q.listDueBetween(u.id, start, end)
    expect(rows.map((r) => r.title)).toEqual(['inside'])
  })
})
