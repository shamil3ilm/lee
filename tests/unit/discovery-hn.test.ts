import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HnWhoIsHiringAdapter, parseCommentHeader } from '@/lib/discovery/adapters/hn-whoishiring'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/hn-whoishiring.json'), 'utf8'),
) as {
  search: { hits: { objectID: string }[] }
  thread: { kids: number[] }
  comments: Record<string, { id: number; text: string; time: number }>
}

describe('HnWhoIsHiringAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('normalizes parseable comments and skips non-conforming ones', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('hn.algolia.com')) {
        return new Response(JSON.stringify(fixture.search), { status: 200 })
      }
      if (url.includes(`/item/${fixture.thread.kids[0] ? '40000000' : ''}`) || url.endsWith('40000000.json')) {
        return new Response(JSON.stringify(fixture.thread), { status: 200 })
      }
      const match = url.match(/\/item\/(\d+)\.json/)
      if (match) {
        const id = match[1]!
        if (id === '40000000') {
          return new Response(JSON.stringify(fixture.thread), { status: 200 })
        }
        const c = fixture.comments[id]
        if (c) return new Response(JSON.stringify(c), { status: 200 })
        return new Response('{}', { status: 404 })
      }
      return new Response('nope', { status: 404 })
    }) as typeof globalThis.fetch

    const items = await new HnWhoIsHiringAdapter().fetch({})
    // 3 parseable comments (skips the "Congrats" one)
    expect(items.length).toBe(3)
    const first = items[0]!.normalized as {
      title: string
      companyName: string
      remoteType: string
      applyUrl: string
    }
    expect(first.companyName).toBe('Acme')
    expect(first.title).toContain('Senior Backend Engineer')
    expect(first.remoteType).toBe('remote')
    expect(first.applyUrl).toMatch(/news\.ycombinator\.com/)
  })

  it('reads the newest monthly thread by date, not the most relevant (once a March 2020 thread)', async () => {
    const now = Date.parse('2026-10-12T00:00:00Z') / 1000
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      urls.push(url)
      if (url.includes('hn.algolia.com')) {
        return new Response(
          JSON.stringify({
            hits: [
              { objectID: '51', title: 'Ask HN: Who wants to be hired? (October 2026)', created_at_i: now - 86_400 * 10 },
              { objectID: '52', title: 'Ask HN: Freelancer? Seeking freelancer? (October 2026)', created_at_i: now - 86_400 * 10 },
              { objectID: '50', title: 'Ask HN: Who is hiring? (October 2026)', created_at_i: now - 86_400 * 10 },
            ],
          }),
          { status: 200 },
        )
      }
      if (url.endsWith('/item/50.json')) return new Response(JSON.stringify({ kids: [] }), { status: 200 })
      return new Response('{}', { status: 404 })
    }) as typeof globalThis.fetch
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
    await new HnWhoIsHiringAdapter().fetch({})
    expect(urls[0]).toMatch(/search_by_date\?/)
    expect(urls[0]).toMatch(/author_whoishiring/)
    expect(urls).toContain('https://hacker-news.firebaseio.com/v0/item/50.json')
    vi.restoreAllMocks()
  })

  it('skips a thread older than two months instead of importing stale postings', async () => {
    const now = Date.parse('2026-10-12T00:00:00Z') / 1000
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      urls.push(url)
      if (url.includes('hn.algolia.com')) {
        return new Response(JSON.stringify({ hits: [{ objectID: '22665398', title: 'Ask HN: Who is hiring? (March 2020)', created_at_i: Date.parse('2020-03-02T00:00:00Z') / 1000 }] }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }) as typeof globalThis.fetch
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
    expect(await new HnWhoIsHiringAdapter().fetch({})).toEqual([])
    expect(urls).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('registry returns adapter', () => {
    expect(getAdapter('hn_whoishiring')).toBeInstanceOf(HnWhoIsHiringAdapter)
  })
})

describe('parseCommentHeader', () => {
  it('parses pipe-separated header', () => {
    const r = parseCommentHeader(
      '<p>Acme | Senior Backend Engineer | Remote (worldwide) | Full-time',
    )
    expect(r?.company).toBe('Acme')
    expect(r?.role).toBe('Senior Backend Engineer')
    expect(r?.remoteType).toBe('remote')
  })

  it('parses middot-separated header', () => {
    const r = parseCommentHeader('<p>Charlie · SRE · Berlin · Onsite')
    expect(r?.company).toBe('Charlie')
    expect(r?.role).toBe('SRE')
    expect(r?.remoteType).toBe('onsite')
    expect(r?.location).toBe('Berlin')
  })

  it('returns null for non-conforming text', () => {
    expect(parseCommentHeader('<p>Congrats on the launch!')).toBeNull()
  })
})
