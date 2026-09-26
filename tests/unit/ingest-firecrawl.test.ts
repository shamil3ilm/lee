import { describe, it, expect, vi, beforeEach } from 'vitest'
import { firecrawlFetch } from '@/lib/ingest/firecrawl'

describe('firecrawlFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { markdown: '# Hello' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
  })

  it('returns markdown from firecrawl, authenticating with the given key', async () => {
    const md = await firecrawlFetch('https://example.com', 'user-key')
    expect(md).toContain('Hello')
    const init = vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer user-key')
  })

  it('refuses to call without a key', async () => {
    await expect(firecrawlFetch('https://example.com', '')).rejects.toThrow('Firecrawl key not set')
  })
})
