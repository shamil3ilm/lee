import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WorkableAdapter } from '@/lib/discovery/adapters/workable'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/workable.json'), 'utf8'),
)

describe('WorkableAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('normalizes workable jobs', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    ) as typeof globalThis.fetch

    const items = await new WorkableAdapter().fetch({ company: 'example' })
    expect(items.length).toBe(2)
    const first = items[0]!.normalized as {
      title: string
      location?: string
      applyUrl: string
      remoteType: string
      employmentType: string
    }
    expect(first.title).toBe('Staff Software Engineer')
    expect(first.location).toMatch(/London/)
    expect(first.applyUrl).toMatch(/^https:\/\/apply\.workable\.com\//)
    expect(first.remoteType).toBe('hybrid')
    expect(first.employmentType).toBe('fulltime')
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(new WorkableAdapter().fetch({ company: 'x' })).rejects.toThrow(/workable 500/)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('workable')).toBeInstanceOf(WorkableAdapter)
  })
})
