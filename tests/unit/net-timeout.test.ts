import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, isTimeoutError, timeoutError } from '@/lib/net/timeout'

const originalFetch = globalThis.fetch

/** A fetch that never answers on its own and only settles when aborted. */
function hangingFetch(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return // would hang forever — the test times out
      signal.addEventListener('abort', () => reject(signal.reason))
    })) as unknown as typeof fetch
}

describe('fetchWithTimeout', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('aborts a hung request after the timeout and throws a labelled Error', async () => {
    globalThis.fetch = hangingFetch()
    const started = Date.now()
    const err = await fetchWithTimeout('https://example.test', {}, { timeoutMs: 30, label: 'thing' }).catch(
      (e: unknown) => e,
    )
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('thing timed out after 30ms')
    expect(isTimeoutError(err)).toBe(true)
  })

  it('passes a signal and returns the response when the call is fast', async () => {
    const spy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return new Response('ok')
    })
    globalThis.fetch = spy as unknown as typeof fetch
    const res = await fetchWithTimeout('https://example.test', { method: 'POST' }, { timeoutMs: 1_000, label: 'x' })
    expect(await res.text()).toBe('ok')
    expect(spy.mock.calls[0]?.[1]?.method).toBe('POST')
  })

  it('lets non-timeout errors through unchanged', async () => {
    const boom = new TypeError('fetch failed')
    globalThis.fetch = (async () => {
      throw boom
    }) as unknown as typeof fetch
    await expect(fetchWithTimeout('https://e.test', {}, { timeoutMs: 1_000, label: 'x' })).rejects.toBe(boom)
  })

  it('still honours a caller-supplied abort signal', async () => {
    globalThis.fetch = hangingFetch()
    const ctrl = new AbortController()
    const p = fetchWithTimeout('https://e.test', { signal: ctrl.signal }, { timeoutMs: 5_000, label: 'x' })
    ctrl.abort(new Error('caller gave up'))
    await expect(p).rejects.toThrow('caller gave up')
  })
})

describe('isTimeoutError', () => {
  it('recognises DOMException TimeoutError and our own timeout errors', () => {
    expect(isTimeoutError(new DOMException('t', 'TimeoutError'))).toBe(true)
    expect(isTimeoutError(timeoutError('a', 5))).toBe(true)
    expect(isTimeoutError(new Error('nope'))).toBe(false)
    expect(isTimeoutError('x')).toBe(false)
  })
})
