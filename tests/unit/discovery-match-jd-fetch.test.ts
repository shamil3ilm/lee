import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJd, htmlToText, jdTarget } from '@/lib/discovery/match/jd-fetch'

afterEach(() => vi.unstubAllGlobals())

describe('jdTarget', () => {
  it('maps public ATS job URLs to their job APIs', () => {
    expect(jdTarget('https://boards.greenhouse.io/examplepay/jobs/4012345')).toEqual({
      kind: 'greenhouse',
      api: 'https://boards-api.greenhouse.io/v1/boards/examplepay/jobs/4012345',
    })
    expect(jdTarget('https://jobs.lever.co/example/0f8fad5b-d9cb-469f-a165-70867728950e')).toEqual({
      kind: 'lever',
      api: 'https://api.lever.co/v0/postings/example/0f8fad5b-d9cb-469f-a165-70867728950e',
    })
  })

  it('returns null for anything else (paste instead)', () => {
    expect(jdTarget('https://www.linkedin.com/jobs/view/123')).toBeNull()
    expect(jdTarget(null)).toBeNull()
  })
})

describe('htmlToText', () => {
  it('keeps headings and bullets as lines and unescapes entities', () => {
    const html = '&lt;h2&gt;Requirements&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;PHP &amp;amp; Laravel&lt;/li&gt;&lt;li&gt;MySQL&lt;/li&gt;&lt;/ul&gt;'
    expect(htmlToText(html)).toBe('## Requirements\n- PHP & Laravel\n- MySQL')
  })
})

describe('fetchJd (offline, stubbed fetch)', () => {
  it('reads Greenhouse content and Lever lists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: '<p>Build APIs</p><ul><li>Laravel</li></ul>' }), { status: 200 })))
    expect(await fetchJd({ kind: 'greenhouse', api: 'https://boards-api.greenhouse.io/v1/boards/x/jobs/1' })).toBe('Build APIs\n- Laravel')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ descriptionPlain: 'Join us.', lists: [{ text: 'Requirements', content: '<li>Go</li>' }] }), { status: 200 })),
    )
    expect(await fetchJd({ kind: 'lever', api: 'https://api.lever.co/v0/postings/x/y' })).toBe('Join us.\n## Requirements\n- Go')
  })

  it('returns null on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })))
    expect(await fetchJd({ kind: 'lever', api: 'https://api.lever.co/v0/postings/x/y' })).toBeNull()
  })
})
