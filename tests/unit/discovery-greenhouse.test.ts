import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GreenhouseAdapter } from '@/lib/discovery/adapters/greenhouse'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/greenhouse.json'), 'utf8'),
)

describe('GreenhouseAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetches and normalizes jobs from the fixture', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof globalThis.fetch

    const adapter = new GreenhouseAdapter()
    const items = await adapter.fetch({ company: 'stripe' })

    expect(items.length).toBeGreaterThan(0)
    expect(items[0]!.normalized.kind).toBe('job')
    const first = items[0]!.normalized as { title: string; companyName: string; applyUrl: string }
    expect(first.title).toBeTruthy()
    expect(first.companyName).toBe('stripe')
    expect(first.applyUrl).toMatch(/^https?:\/\//)
    expect(items[0]!.sourceItemId).toBeTruthy()
    expect(items[0]!.raw).toBeTruthy()
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    const adapter = new GreenhouseAdapter()
    await expect(adapter.fetch({ company: 'stripe' })).rejects.toThrow(/greenhouse 500/)
  })

  it('registry returns the adapter by kind', () => {
    expect(getAdapter('greenhouse')).toBeInstanceOf(GreenhouseAdapter)
    expect(getAdapter('does-not-exist')).toBeNull()
  })
})
