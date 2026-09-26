import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('next/server')
  vi.resetModules()
})

describe('runAfterResponse', () => {
  it('awaits the task when there is no request scope (cron, tests, scripts)', async () => {
    const { runAfterResponse } = await import('@/lib/server/after-response')
    let done = false
    await runAfterResponse('t', async () => {
      await new Promise((r) => setTimeout(r, 10))
      done = true
    })
    expect(done).toBe(true)
  })

  it('hands the task to after() and returns without waiting inside a request', async () => {
    const scheduled: Array<Promise<unknown>> = []
    vi.doMock('next/server', () => ({
      after: (task: Promise<unknown>) => {
        scheduled.push(task)
      },
    }))
    const { runAfterResponse } = await import('@/lib/server/after-response')
    let release!: () => void
    let done = false
    await runAfterResponse('t', async () => {
      await new Promise<void>((r) => {
        release = r
      })
      done = true
    })
    // Returned while the task is still blocked.
    expect(done).toBe(false)
    expect(scheduled).toHaveLength(1)
    release()
    await scheduled[0]
    expect(done).toBe(true)
  })

  it('never throws when the task fails', async () => {
    const { runAfterResponse } = await import('@/lib/server/after-response')
    await expect(
      runAfterResponse('t', async () => {
        throw new Error('db down')
      }),
    ).resolves.toBeUndefined()
  })

  it('settleDeferred waits for every task still in flight', async () => {
    vi.doMock('next/server', () => ({ after: () => {} }))
    const { runAfterResponse, settleDeferred } = await import('@/lib/server/after-response')
    let done = false
    await runAfterResponse('t', async () => {
      await new Promise((r) => setTimeout(r, 10))
      done = true
    })
    expect(done).toBe(false)
    await settleDeferred()
    expect(done).toBe(true)
  })
})
