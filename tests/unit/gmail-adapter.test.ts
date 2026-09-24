import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractAllEmailAddresses,
  extractDomain,
  extractEmailAddress,
  extractHeader,
  getThread,
  listThreads,
  type GmailMessage,
} from '@/lib/gmail/adapter'

const originalFetch = globalThis.fetch

function buildMessage(headers: Array<[string, string]>, overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: 'm1',
    threadId: 't1',
    snippet: 'snip',
    internalDate: '1700000000000',
    payload: { headers: headers.map(([name, value]) => ({ name, value })) },
    ...overrides,
  }
}

describe('gmail adapter — extractors', () => {
  it('extractHeader is case-insensitive on header name', () => {
    const msg = buildMessage([['From', 'a@b.com'], ['SUBJECT', 'hi']])
    expect(extractHeader(msg, 'from')).toBe('a@b.com')
    expect(extractHeader(msg, 'Subject')).toBe('hi')
    expect(extractHeader(msg, 'To')).toBeUndefined()
  })

  it('extractEmailAddress unwraps "Name <email>" form and lowercases', () => {
    expect(extractEmailAddress('Alex Smith <Alex@Example.COM>')).toBe('alex@example.com')
  })

  it('extractEmailAddress accepts bare email', () => {
    expect(extractEmailAddress('foo@bar.com')).toBe('foo@bar.com')
  })

  it('extractEmailAddress returns undefined for empty / undefined', () => {
    expect(extractEmailAddress(undefined)).toBeUndefined()
    expect(extractEmailAddress('')).toBeUndefined()
    expect(extractEmailAddress('   ')).toBeUndefined()
  })

  it('extractAllEmailAddresses splits multi-recipient headers and dedupes', () => {
    const header = 'Alex <alex@x.com>, sam@x.com, "Alex" <alex@x.com>'
    expect(extractAllEmailAddresses(header)).toEqual(['alex@x.com', 'sam@x.com'])
  })

  it('extractDomain returns the domain part lowercased', () => {
    expect(extractDomain('careers@Stripe.COM')).toBe('stripe.com')
    expect(extractDomain('nope')).toBeUndefined()
    expect(extractDomain('user@')).toBeUndefined()
    expect(extractDomain(undefined)).toBeUndefined()
  })
})

describe('gmail adapter — REST calls', () => {
  beforeEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })
  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('listThreads sends bearer token + newer_than filter + returns threads', async () => {
    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify({ threads: [{ id: 't1', historyId: '10', snippet: 's' }] }),
        { status: 200 },
      ),
    )
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch

    const threads = await listThreads({ tokens: { accessToken: 'AT' } })
    expect(threads).toEqual([{ id: 't1', historyId: '10', snippet: 's' }])
    const firstCall = fake.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url, init] = firstCall as unknown as [string, RequestInit]
    expect(url).toContain('newer_than%3A30d')
    expect(url).toContain('maxResults=100')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer AT')
  })

  it('listThreads returns [] when response has no threads', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('{}', { status: 200 })) as unknown as typeof fetch
    expect(await listThreads({ tokens: { accessToken: 'AT' } })).toEqual([])
  })

  it('listThreads throws with the status when Gmail 401s', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nope', { status: 401 })) as unknown as typeof fetch
    await expect(listThreads({ tokens: { accessToken: 'AT' } })).rejects.toThrow(/401/)
  })

  it('getThread requests metadata format with the expected headers', async () => {
    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 't1',
          messages: [
            {
              id: 'm1',
              threadId: 't1',
              snippet: 'hi',
              internalDate: '1700000000000',
              payload: { headers: [{ name: 'From', value: 'a@b.com' }] },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch

    const thread = await getThread({ tokens: { accessToken: 'AT' }, threadId: 't1' })
    expect(thread.messages).toHaveLength(1)
    const firstCall = fake.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url] = firstCall as unknown as [string]
    expect(url).toContain('/threads/t1')
    expect(url).toContain('format=metadata')
    expect(url).toContain('metadataHeaders=From')
    expect(url).toContain('metadataHeaders=Subject')
  })
})
