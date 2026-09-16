import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AshbyAdapter } from '@/lib/discovery/adapters/ashby'
import { getAdapter } from '@/lib/discovery/adapters'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/discovery/ashby.json'), 'utf8'),
)

describe('AshbyAdapter', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('normalizes ashby jobs', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    ) as typeof globalThis.fetch

    const items = await new AshbyAdapter().fetch({ company: 'openai' })
    expect(items.length).toBe(3)
    const first = items[0]!.normalized as {
      title: string
      applyUrl: string
      companyName: string
      employmentType: string
      postedAt?: Date
    }
    expect(first.title).toBeTruthy()
    expect(first.companyName).toBe('openai')
    expect(first.applyUrl).toMatch(/^https:\/\/jobs\.ashbyhq\.com\//)
    expect(first.employmentType).toBe('fulltime')
    expect(first.postedAt).toBeInstanceOf(Date)
  })

  it('propagates HTTP errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof globalThis.fetch
    await expect(new AshbyAdapter().fetch({ company: 'x' })).rejects.toThrow(/ashby 500/)
  })

  it('registry returns adapter', () => {
    expect(getAdapter('ashby')).toBeInstanceOf(AshbyAdapter)
  })
})
