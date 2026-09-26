import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('next/server')
  vi.resetModules()
})

/** Stand-in for Next's after(): collects callbacks; the test "ends the response". */
function mockRequestScope(): Array<() => Promise<void>> {
  const scheduled: Array<() => Promise<void>> = []
  vi.doMock('next/server', () => ({
    after: (task: () => Promise<void>) => {
      scheduled.push(task)
    },
  }))
  return scheduled
}

describe('runAfterResponse', () => {
  it('runs the task inline when there is no request scope (cron, tests, scripts)', async () => {
    const { runAfterResponse } = await import('@/lib/server/after-response')
    let done = false
    await runAfterResponse('t', async () => {
      await new Promise((r) => setTimeout(r, 10))
      done = true
    })
    expect(done).toBe(true)
  })

  it('inside a request, registers the task with after() and does not start it', async () => {
    const scheduled = mockRequestScope()
    const { runAfterResponse } = await import('@/lib/server/after-response')
    let started = false
    await runAfterResponse('t', async () => {
      started = true
    })
    expect(started).toBe(false)
    expect(scheduled).toHaveLength(1)
    await scheduled[0]!()
    expect(started).toBe(true)
  })

  it('never throws when the task fails', async () => {
    const { runAfterResponse } = await import('@/lib/server/after-response')
    await expect(
      runAfterResponse('t', async () => {
        throw new Error('db down')
      }),
    ).resolves.toBeUndefined()
  })

  it('waitForEarlier waits for tasks scheduled before it, even when they run concurrently', async () => {
    const scheduled = mockRequestScope()
    const { runAfterResponse, settleDeferred } = await import('@/lib/server/after-response')
    const order: string[] = []
    await runAfterResponse('first', async () => {
      await new Promise((r) => setTimeout(r, 15))
      order.push('first')
    })
    await runAfterResponse('second', async ({ waitForEarlier }) => {
      await waitForEarlier()
      order.push('second')
    })
    // after() starts all callbacks together once the response closes.
    await Promise.all(scheduled.map((t) => t()))
    await settleDeferred()
    expect(order).toEqual(['first', 'second'])
  })
})
