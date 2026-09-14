import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPage } from '@/lib/ingest/fetch'

describe('fetchPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response('<html><body>hi</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch
  })

  it('returns html for https url', async () => {
    const r = await fetchPage('https://example.com')
    expect(r.status).toBe(200)
    expect(r.html).toContain('hi')
  })

  it('rejects http', async () => {
    await expect(fetchPage('http://example.com')).rejects.toThrow()
  })
})
