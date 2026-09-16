import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RemoteOkAdapter } from '@/lib/discovery/adapters/remoteok'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/remoteok.json'), 'utf8'),
)

describe('RemoteOkAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('skips the metadata element and normalizes jobs', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    ) as typeof globalThis.fetch

    const items = await new RemoteOkAdapter().fetch({})
    // fixture has 1 metadata + 3 jobs => expect 3
    expect(items.length).toBe(3)
    const first = items[0]!.normalized as {
      title: string
      companyName: string
      applyUrl: string
      remoteType: string
      techStack: string[]
    }
    expect(first.title).toBe('Senior Backend Engineer')
    expect(first.companyName).toBe('Acme')
    expect(first.remoteType).toBe('remote')
    expect(first.techStack).toContain('go')
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(new RemoteOkAdapter().fetch({})).rejects.toThrow(/remoteok 500/)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('remoteok')).toBeInstanceOf(RemoteOkAdapter)
  })
})
