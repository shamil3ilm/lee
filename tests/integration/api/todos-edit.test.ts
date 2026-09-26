import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { todos } from '@/lib/db/schema'
import { makeUser, makeJob, makeApplication, makeContact } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

function req(method: string, body: unknown): Request {
  return new Request('http://localhost/api/todos/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function makeTodo(userId: string, title = 'Old') {
  const [row] = await db.insert(todos).values({ userId, title }).returning()
  return row!
}

beforeEach(() => authMock.mockReset())

describe('PATCH /api/todos/[id] (edit todo)', () => {
  it('edits title, notes, priority and due date', async () => {
    const { PATCH } = await import('@/app/api/todos/[id]/route')
    const me = await makeUser()
    const t = await makeTodo(me.id)
    authMock.mockResolvedValue({ user: { id: me.id } })
    const due = '2030-02-01T23:59:59.000Z'
    const res = await PATCH(req('PATCH', { title: 'New', notesMd: 'n', priority: 3, dueAt: due }), ctx(t.id))
    expect(res.status).toBe(200)
    const [row] = await db.select().from(todos).where(eq(todos.id, t.id))
    expect(row).toMatchObject({ title: 'New', notesMd: 'n', priority: 3 })
    expect(row?.dueAt?.toISOString()).toBe(due)
  })

  it("404s on another user's todo", async () => {
    const { PATCH, DELETE } = await import('@/app/api/todos/[id]/route')
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeTodo(other.id)
    authMock.mockResolvedValue({ user: { id: me.id } })
    expect((await PATCH(req('PATCH', { title: 'Hijack' }), ctx(theirs.id))).status).toBe(404)
    expect((await DELETE(req('DELETE', {}), ctx(theirs.id))).status).toBe(404)
    const [row] = await db.select().from(todos).where(eq(todos.id, theirs.id))
    expect(row?.title).toBe('Old')
  })

  it("refuses to link a todo to another user's application or contact", async () => {
    const { PATCH } = await import('@/app/api/todos/[id]/route')
    const { POST } = await import('@/app/api/todos/route')
    const me = await makeUser()
    const other = await makeUser()
    const theirApp = await makeApplication(other.id, (await makeJob(other.id, null)).id)
    const theirContact = await makeContact(other.id)
    const mine = await makeTodo(me.id)
    authMock.mockResolvedValue({ user: { id: me.id } })

    const patched = await PATCH(req('PATCH', { applicationId: theirApp.id }), ctx(mine.id))
    expect(patched.status).toBe(404)
    const created = await POST(req('POST', { title: 'x', contactId: theirContact.id }))
    expect(created.status).toBe(404)
    const [row] = await db.select().from(todos).where(eq(todos.id, mine.id))
    expect(row?.applicationId).toBeNull()
  })

  it('still links a todo to your own application', async () => {
    const { POST } = await import('@/app/api/todos/route')
    const me = await makeUser()
    const app = await makeApplication(me.id, (await makeJob(me.id, null)).id)
    authMock.mockResolvedValue({ user: { id: me.id } })
    const res = await POST(req('POST', { title: 'Prep', applicationId: app.id }))
    expect(res.status).toBe(201)
  })
})
