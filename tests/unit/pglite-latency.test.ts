import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { parseQueryDelay, withSimulatedLatency } from '@/lib/db/pglite-latency'

describe('parseQueryDelay', () => {
  it('is off unless given a positive whole number of ms', () => {
    expect(parseQueryDelay(undefined)).toBe(0)
    expect(parseQueryDelay('')).toBe(0)
    expect(parseQueryDelay('abc')).toBe(0)
    expect(parseQueryDelay('-5')).toBe(0)
    expect(parseQueryDelay('1.5')).toBe(0)
    expect(parseQueryDelay('1500')).toBe(1500)
  })

  it('caps the delay at 10 s', () => {
    expect(parseQueryDelay('999999')).toBe(10_000)
  })
})

describe('withSimulatedLatency', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  class FakeClient {
    readonly calls: string[] = []
    readonly name = 'fake'
    async query(sql: string) {
      this.calls.push(sql)
      return { rows: [] }
    }
    async exec(sql: string) {
      this.calls.push(sql)
      return []
    }
    async close() {
      this.calls.push('close')
    }
  }

  it('returns the client itself when the delay is 0', () => {
    const client = new FakeClient() as unknown as PGlite
    expect(withSimulatedLatency(client, 0)).toBe(client)
  })

  it('delays query and exec, not other methods or properties', async () => {
    vi.useFakeTimers()
    const raw = new FakeClient()
    const client = withSimulatedLatency(raw as unknown as PGlite, 1000)

    const pending = client.query('select 1')
    await vi.advanceTimersByTimeAsync(999)
    expect(raw.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(raw.calls).toEqual(['select 1'])

    await client.close()
    expect(raw.calls).toEqual(['select 1', 'close'])
    expect((client as unknown as FakeClient).name).toBe('fake')
    expect(client).toBeInstanceOf(FakeClient)
  })
})
