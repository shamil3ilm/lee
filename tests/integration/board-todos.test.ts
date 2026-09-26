import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { todos } from '@/lib/db/schema'
import * as q from '@/lib/db/queries/todos'
import { moveTodo } from '@/app/(authed)/todos/actions'
import { gatherPipelineSnapshot } from '@/lib/digest/weekly'
import { makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const H = 60 * 60 * 1000

async function row(id: string) {
  const [r] = await db.select().from(todos).where(eq(todos.id, id))
  return r!
}

beforeEach(() => {
  sessionMock.mockReset()
})

describe('moveTodo (todos board)', () => {
  it('moves across To do, In progress, Waiting and Done, tracking completedAt', async () => {
    const me = await makeUser()
    const t = await q.create(me.id, { title: 'Chase recruiter' })
    sessionMock.mockResolvedValue(me.id)

    expect(await moveTodo(t.id, 'in_progress')).toEqual({ success: true })
    expect((await row(t.id)).status).toBe('in_progress')

    expect(await moveTodo(t.id, 'waiting')).toEqual({ success: true })
    expect((await row(t.id)).status).toBe('waiting')

    expect(await moveTodo(t.id, 'done')).toEqual({ success: true })
    const done = await row(t.id)
    expect(done.status).toBe('done')
    expect(done.completedAt).toBeInstanceOf(Date)

    // Done → Done keeps the original completion time.
    await moveTodo(t.id, 'done')
    expect((await row(t.id)).completedAt?.getTime()).toBe(done.completedAt!.getTime())

    expect(await moveTodo(t.id, 'open')).toEqual({ success: true })
    const reopened = await row(t.id)
    expect(reopened.status).toBe('open')
    expect(reopened.completedAt).toBeNull()
  })

  it('rejects archived, unknown columns and bad ids', async () => {
    const me = await makeUser()
    const t = await q.create(me.id, { title: 'x' })
    sessionMock.mockResolvedValue(me.id)
    expect(await moveTodo(t.id, 'archived')).toEqual({ error: 'Invalid move.' })
    expect(await moveTodo(t.id, 'blocked')).toEqual({ error: 'Invalid move.' })
    expect(await moveTodo('nope', 'done')).toEqual({ error: 'Invalid move.' })
    expect((await row(t.id)).status).toBe('open')
  })

  it("cannot move another user's todo", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await q.create(other.id, { title: 'theirs' })
    sessionMock.mockResolvedValue(me.id)
    expect(await moveTodo(theirs.id, 'done')).toEqual({ error: 'Todo not found.' })
    expect((await row(theirs.id)).status).toBe('open')
  })
})

describe('active todo statuses in consumers', () => {
  it('overdue, due-soon and reminder queries include in progress and waiting', async () => {
    const u = await makeUser()
    const now = new Date()
    const past = new Date(now.getTime() - 2 * H)
    const soon = new Date(now.getTime() + 2 * H)
    await q.create(u.id, { title: 'open', status: 'open', dueAt: past })
    await q.create(u.id, { title: 'doing', status: 'in_progress', dueAt: past })
    await q.create(u.id, { title: 'blocked', status: 'waiting', dueAt: soon })
    await q.create(u.id, { title: 'finished', status: 'done', dueAt: past })
    await q.create(u.id, { title: 'shelved', status: 'archived', dueAt: past })

    expect(await q.countOverdue(u.id, now)).toBe(2)
    const dueToday = await q.listDueByEnd(u.id, new Date(now.getTime() + 24 * H))
    expect(dueToday.map((t) => t.title).sort()).toEqual(['blocked', 'doing', 'open'])
    const between = await q.listDueBetween(u.id, now, new Date(now.getTime() + 3 * H))
    expect(between.map((t) => t.title)).toEqual(['blocked'])
  })

  it('toggle finishes any active status and reopens done as To do', async () => {
    const u = await makeUser()
    const t = await q.create(u.id, { title: 'wip', status: 'waiting' })
    expect((await q.toggleStatus(u.id, t.id))?.status).toBe('done')
    expect((await q.toggleStatus(u.id, t.id))?.status).toBe('open')
  })

  it('board listing: every active todo, recent done capped, archived hidden', async () => {
    const u = await makeUser()
    await q.create(u.id, { title: 'a', status: 'open' })
    await q.create(u.id, { title: 'b', status: 'in_progress' })
    await q.create(u.id, { title: 'c', status: 'waiting' })
    await q.create(u.id, { title: 'z', status: 'archived' })
    for (let i = 0; i < 4; i++) {
      await q.create(u.id, { title: `d${i}`, status: 'done', completedAt: new Date(Date.now() - i * H) })
    }
    const rows = await q.listForBoard(u.id, { doneLimit: 2 })
    expect(rows.map((r) => r.title)).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd0', 'd1']))
    expect(rows.map((r) => r.title)).not.toContain('z')
    expect(rows.map((r) => r.title)).not.toContain('d3')
    expect(await q.countDone(u.id)).toBe(4)
    // The default list (no status) is the active set.
    const active = await q.list(u.id, { statuses: q.TODO_ACTIVE_STATUSES })
    expect(active.map((r) => r.title).sort()).toEqual(['a', 'b', 'c'])
  })

  it('the weekly digest lists waiting todos as upcoming', async () => {
    const u = await makeUser()
    const now = new Date()
    await q.create(u.id, { title: 'blocked on reply', status: 'waiting', dueAt: new Date(now.getTime() + 24 * H) })
    await q.create(u.id, { title: 'already done', status: 'done', dueAt: new Date(now.getTime() + 24 * H) })
    const snap = await gatherPipelineSnapshot(u.id)
    expect(snap.upcomingTodos.map((t) => t.title)).toEqual(['blocked on reply'])
  })
})
