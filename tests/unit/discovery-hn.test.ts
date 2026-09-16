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
