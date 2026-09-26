import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCompileScheduler, type CompileScheduler } from '@/lib/latex/auto-compile'

interface Deferred {
  resolve: () => void
}

describe('createCompileScheduler', () => {
  let runs: string[]
  let pending: Deferred[]
  let scheduler: CompileScheduler<string>

  beforeEach(() => {
    vi.useFakeTimers()
    runs = []
    pending = []
    scheduler = createCompileScheduler<string>({
      debounceMs: 2500,
      maxWaitMs: 5000,
      keyOf: (s) => s,
      run: (s) => {
        runs.push(s)
        return new Promise<void>((resolve) => pending.push({ resolve }))
      },
    })
  })

  afterEach(() => {
    scheduler.dispose()
    vi.useRealTimers()
  })

  async function finishRun(): Promise<void> {
    pending.shift()?.resolve()
    await vi.advanceTimersByTimeAsync(0)
  }

  it('compiles 2.5 s after the last change', async () => {
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(2000)
    scheduler.change('ab')
    await vi.advanceTimersByTimeAsync(2499)
    expect(runs).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(runs).toEqual(['ab'])
  })

  it('compiles after at most 5 s of continuous typing', async () => {
    for (let t = 0; t < 12; t++) {
      scheduler.change(`v${t}`)
      await vi.advanceTimersByTimeAsync(500)
    }
    // Changes every 0.5 s never let the debounce fire; max wait does at 5 s.
    expect(runs).toEqual(['v9'])
  })

  it('never compiles an unchanged source', async () => {
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(2500)
    await finishRun()
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(6000)
    expect(runs).toEqual(['a'])
  })

  it('keeps at most one compile in flight and runs the latest afterwards', async () => {
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(2500)
    expect(runs).toEqual(['a'])
    scheduler.change('ab')
    await vi.advanceTimersByTimeAsync(2500)
    scheduler.change('abc')
    await vi.advanceTimersByTimeAsync(2500)
    expect(runs).toEqual(['a']) // still in flight
    await finishRun()
    expect(runs).toEqual(['a', 'abc'])
  })

  it('does not follow up when the in-flight compile already had the latest source', async () => {
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(2500)
    scheduler.change('ab')
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(2500)
    await finishRun()
    expect(runs).toEqual(['a'])
  })

  it('does nothing while disabled, and resumes when enabled', async () => {
    scheduler.setEnabled(false)
    scheduler.change('a')
    await vi.advanceTimersByTimeAsync(6000)
    expect(runs).toEqual([])
    scheduler.setEnabled(true)
    scheduler.change('ab')
    await vi.advanceTimersByTimeAsync(2500)
    expect(runs).toEqual(['ab'])
  })

  it('compileNow runs immediately, cancels the timers, and forces an unchanged source', async () => {
    scheduler.change('a')
    scheduler.compileNow('a')
    expect(runs).toEqual(['a'])
    await finishRun()
    await vi.advanceTimersByTimeAsync(6000)
    expect(runs).toEqual(['a'])
    scheduler.compileNow('a')
    expect(runs).toEqual(['a', 'a'])
  })

  it('compileNow while a compile is in flight queues one follow-up', async () => {
    scheduler.compileNow('a')
    scheduler.compileNow('a')
    scheduler.compileNow('a')
    expect(runs).toEqual(['a'])
    await finishRun()
    expect(runs).toEqual(['a', 'a'])
    await finishRun()
    expect(runs).toEqual(['a', 'a'])
  })

  it('a failed run releases the in-flight slot', async () => {
    const failing = createCompileScheduler<string>({
      debounceMs: 10,
      maxWaitMs: 20,
      keyOf: (s) => s,
      run: () => Promise.reject(new Error('boom')),
    })
    failing.compileNow('x')
    await vi.advanceTimersByTimeAsync(0)
    expect(failing.busy).toBe(false)
    failing.dispose()
  })
})
