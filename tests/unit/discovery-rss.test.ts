import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RssAdapter } from '@/lib/discovery/adapters/rss'
import { getAdapter } from '@/lib/discovery/adapters'

const xml = readFileSync(join(__dirname, '../fixtures/discovery/rss.xml'), 'utf8')

describe('RssAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('parses items from an RSS feed', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }),
    ) as typeof globalThis.fetch

    const items = await new RssAdapter().fetch({ url: 'https://jobs.example.com/feed.xml' })
    expect(items.length).toBe(2)
    const first = items[0]!.normalized as {
      title: string
      applyUrl: string
      companyName: string
      postedAt?: Date
    }
    expect(first.title).toBe('Senior Backend Engineer (Go)')
    expect(first.applyUrl).toBe('https://jobs.example.com/postings/12345')
    expect(first.companyName).toBe('jobs.example.com')
    expect(first.postedAt).toBeInstanceOf(Date)
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(
      new RssAdapter().fetch({ url: 'https://jobs.example.com/feed.xml' }),
    ).rejects.toThrow(/rss 500/)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('rss')).toBeInstanceOf(RssAdapter)
  })
})
