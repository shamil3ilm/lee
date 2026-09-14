import { describe, it, expect, vi, beforeEach } from 'vitest'
import { firecrawlFetch } from '@/lib/ingest/firecrawl'

vi.mock('@/lib/env', () => ({ env: { FIRECRAWL_API_KEY: 'k' } }))

describe('firecrawlFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { markdown: '# Hello' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
  })

  it('returns markdown from firecrawl', async () => {
    const md = await firecrawlFetch('https://example.com')
    expect(md).toContain('Hello')
  })
})
