import { describe, it, expect } from 'vitest'
import * as discQ from '@/lib/db/queries/discoveries'
import * as todosQ from '@/lib/db/queries/todos'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'

const H = 60 * 60 * 1000

describe('nav badge counts', () => {
  it('discoveries.countNew counts only status=new rows for the user', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const src = await makeSource(u.id)
    const otherSrc = await makeSource(other.id)
    await makeDiscovery(u.id, src.id)
    await makeDiscovery(u.id, src.id)
    await makeDiscovery(u.id, src.id, { status: 'saved' })
    await makeDiscovery(u.id, src.id, { status: 'dismissed' })
    await makeDiscovery(other.id, otherSrc.id)
    expect(await discQ.countNew(u.id)).toBe(2)
    expect(await discQ.countNew(other.id)).toBe(1)
  })

  it('discoveries.countNew is 0 with no rows', async () => {
    const u = await makeUser()
    expect(await discQ.countNew(u.id)).toBe(0)
  })

  it('todos.countOverdue counts open todos due before now only', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const now = new Date('2026-09-25T12:00:00Z')
    await todosQ.create(u.id, { title: 'overdue', dueAt: new Date(now.getTime() - H) })
    await todosQ.create(u.id, { title: 'overdue 2', dueAt: new Date(now.getTime() - 48 * H) })
    await todosQ.create(u.id, { title: 'future', dueAt: new Date(now.getTime() + H) })
    await todosQ.create(u.id, { title: 'no due' })
    await todosQ.create(u.id, {
      title: 'done overdue',
      status: 'done',
      dueAt: new Date(now.getTime() - H),
    })
    await todosQ.create(other.id, { title: 'theirs', dueAt: new Date(now.getTime() - H) })
    expect(await todosQ.countOverdue(u.id, now)).toBe(2)
  })
})
