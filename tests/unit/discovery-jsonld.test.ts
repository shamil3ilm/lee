import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JsonLdAdapter } from '@/lib/discovery/adapters/jsonld'
import { getAdapter } from '@/lib/discovery/adapters'

const html = readFileSync(join(__dirname, '../fixtures/discovery/jsonld.html'), 'utf8')

describe('JsonLdAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('extracts JobPosting from ld+json script', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    ) as typeof globalThis.fetch

    const items = await new JsonLdAdapter().fetch({
      url: 'https://delta.example.com/jobs/98765',
    })
    expect(items.length).toBe(1)
    const j = items[0]!.normalized as {
      title: string
      companyName: string
      remoteType: string
      employmentType: string
      location?: string
      techStack: string[]
      salary?: { min?: number; currency?: string }
    }
    expect(j.title).toBe('Senior Platform Engineer')
    expect(j.companyName).toBe('Delta')
    expect(j.remoteType).toBe('remote')
    expect(j.employmentType).toBe('fulltime')
    expect(j.location).toMatch(/Dublin/)
    expect(j.techStack).toContain('Go')
    expect(j.salary?.min).toBe(90000)
    expect(j.salary?.currency).toBe('EUR')
  })

  it('accepts an array of URLs and continues after per-URL failure', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      if (calls === 1) return new Response('bad', { status: 500 })
      return new Response(html, { status: 200 })
    }) as typeof globalThis.fetch

    const items = await new JsonLdAdapter().fetch({
      urls: ['https://a.example.com/jobs/1', 'https://delta.example.com/jobs/98765'],
    })
    expect(items.length).toBe(1)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('jsonld')).toBeInstanceOf(JsonLdAdapter)
  })
})
