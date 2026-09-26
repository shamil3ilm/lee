import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('next/server')
  vi.resetModules()
})

describe('scheduleVisitDrain inside a request', () => {
  it('only registers an after() task — no DB work until the response is done', async () => {
    const scheduled: Array<() => Promise<void>> = []
    vi.doMock('next/server', () => ({
      after: (task: () => Promise<void>) => {
        scheduled.push(task)
      },
    }))
    const { z } = await import('zod')
    const { db } = await import('@/lib/db/client')
    const { eq } = await import('drizzle-orm')
    const { queueJobs } = await import('@/lib/db/schema')
    const { enqueue } = await import('@/lib/queue/queue')
    const { createRegistry, defineHandler } = await import('@/lib/queue/registry')
    const { scheduleVisitDrain } = await import('@/lib/queue/visit')
    const { makeUser } = await import('@/tests/factories')

    const u = await makeUser()
    const id = await enqueue('t', {}, { userId: u.id })
    const registry = createRegistry([
      defineHandler({ type: 't', scope: 'user', payload: z.object({}), timeoutMs: 1_000, async run() {} }),
    ])
    const execute = vi.spyOn(db, 'execute')

    await scheduleVisitDrain(u.id, { registry })
    expect(scheduled).toHaveLength(1)
    expect(execute).not.toHaveBeenCalled()
    const [before] = await db.select().from(queueJobs).where(eq(queueJobs.id, id!))
    expect(before?.status).toBe('queued')

    await scheduled[0]!()
    const [after] = await db.select().from(queueJobs).where(eq(queueJobs.id, id!))
    expect(after?.status).toBe('done')
    execute.mockRestore()
  })
})
