import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LeverAdapter } from '@/lib/discovery/adapters/lever'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/lever.json'), 'utf8'),
)

describe('LeverAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('normalizes lever postings', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    ) as typeof globalThis.fetch

    const adapter = new LeverAdapter()
    const items = await adapter.fetch({ company: 'leverdemo' })

    expect(items.length).toBe(3)
    const first = items[0]!.normalized as {
      kind: string
      title: string
      applyUrl: string
      remoteType: string
      companyName: string
    }
    expect(first.kind).toBe('job')
    expect(first.title).toBeTruthy()
    expect(first.applyUrl).toMatch(/^https:\/\/jobs\.lever\.co\//)
    expect(first.companyName).toBe('leverdemo')
    expect(first.remoteType).toBe('remote')
    expect(items[0]!.sourceItemId).toBe(items[0]!.sourceItemId)
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(new LeverAdapter().fetch({ company: 'x' })).rejects.toThrow(/lever 500/)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('lever')).toBeInstanceOf(LeverAdapter)
  })
})
