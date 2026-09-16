import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchPublicRepos } from '@/lib/github/adapter'

const originalFetch = globalThis.fetch

describe('github adapter', () => {
  beforeEach(() => {
    // Explicit reset per test so mock state does not leak.
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })
  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })

  it('maps GitHub API JSON to GitHubRepo shape', async () => {
    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            name: 'employ',
            description: 'Job tracker',
            html_url: 'https://github.com/shamil/employ',
            language: 'TypeScript',
            stargazers_count: 42,
            updated_at: '2026-09-01T10:00:00Z',
          },
        ]),
        { status: 200 },
      ),
    )
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch
    const repos = await fetchPublicRepos('shamil')
    expect(repos).toHaveLength(1)
    expect(repos[0]).toEqual({
      name: 'employ',
      description: 'Job tracker',
      url: 'https://github.com/shamil/employ',
      primaryLanguage: 'TypeScript',
      stargazers: 42,
      updatedAt: '2026-09-01T10:00:00Z',
    })
    const call = fake.mock.calls[0]?.[0] as string
    expect(call).toContain('/users/shamil/repos')
  })

  it('adds bearer token when provided', async () => {
    const fake = vi.fn(async () => new Response('[]', { status: 200 }))
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch
    await fetchPublicRepos('u', 'tok')
    const opts = fake.mock.calls[0]?.[1] as RequestInit
    const headers = opts.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer tok')
  })

  it('throws a friendly error on 404', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nope', { status: 404 })) as unknown as typeof fetch
    await expect(fetchPublicRepos('ghost')).rejects.toThrow(/not found/i)
  })

  it('throws a rate-limit error on 403', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nope', { status: 403 })) as unknown as typeof fetch
    await expect(fetchPublicRepos('u')).rejects.toThrow(/rate limit/i)
  })
})
