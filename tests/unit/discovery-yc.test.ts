import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { YcDirectoryAdapter } from '@/lib/discovery/adapters/yc-directory'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/yc-directory.json'), 'utf8'),
)

describe('YcDirectoryAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('normalizes companies', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    ) as typeof globalThis.fetch

    const items = await new YcDirectoryAdapter().fetch({})
    expect(items.length).toBe(3)
    const stripe = items[0]!.normalized as {
      kind: string
      name: string
      domain?: string
      industry?: string[]
      size?: string
    }
    expect(stripe.kind).toBe('company')
    expect(stripe.name).toBe('Stripe')
    expect(stripe.domain).toBe('stripe.com')
    expect(stripe.industry).toContain('Fintech')
    expect(stripe.size).toBe('1000+')
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(new YcDirectoryAdapter().fetch({})).rejects.toThrow(/yc_directory 500/)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('yc_directory')).toBeInstanceOf(YcDirectoryAdapter)
  })
})
