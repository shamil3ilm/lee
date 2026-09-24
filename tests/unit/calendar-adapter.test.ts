import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createEvent, deleteEvent, updateEvent } from '@/lib/calendar/adapter'

const originalFetch = globalThis.fetch

describe('calendar adapter', () => {
  beforeEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })
  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('createEvent POSTs to primary calendar and returns event id', async () => {
    const fake = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'evt_123' }), { status: 200 }),
    )
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch

    const result = await createEvent({
      tokens: { accessToken: 'AT' },
      event: {
        summary: 'Interview: SWE @ Acme',
        start: { dateTime: '2026-10-01T10:00:00.000Z', timeZone: 'Asia/Dubai' },
        end: { dateTime: '2026-10-01T11:00:00.000Z', timeZone: 'Asia/Dubai' },
      },
    })

    expect(result).toEqual({ eventId: 'evt_123' })
    const firstCall = fake.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url, init] = firstCall as unknown as [string, RequestInit]
    expect(url).toContain('/calendars/primary/events')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer AT')
    expect(headers['content-type']).toBe('application/json')
    const parsed = JSON.parse(init.body as string) as { summary: string }
    expect(parsed.summary).toBe('Interview: SWE @ Acme')
  })

  it('createEvent throws with status on error', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('bad', { status: 400 })) as unknown as typeof fetch
    await expect(
      createEvent({
        tokens: { accessToken: 'AT' },
        event: {
          summary: 's',
          start: { dateTime: 'x' },
          end: { dateTime: 'y' },
        },
      }),
    ).rejects.toThrow(/400/)
  })

  it('createEvent throws when Google returns no id', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('{}', { status: 200 })) as unknown as typeof fetch
    await expect(
      createEvent({
        tokens: { accessToken: 'AT' },
        event: {
          summary: 's',
          start: { dateTime: 'x' },
          end: { dateTime: 'y' },
        },
      }),
    ).rejects.toThrow(/no event id/i)
  })

  it('updateEvent PATCHes and swallows 200 responses', async () => {
    const fake = vi.fn(async () => new Response('{}', { status: 200 }))
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch
    await updateEvent({
      tokens: { accessToken: 'AT' },
      eventId: 'evt_a',
      event: { summary: 'new title' },
    })
    const firstCall = fake.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url, init] = firstCall as unknown as [string, RequestInit]
    expect(url).toContain('/events/evt_a')
    expect(init.method).toBe('PATCH')
  })

  it('deleteEvent treats 204 as success', async () => {
    const fake = vi.fn(async () => new Response(null, { status: 204 }))
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch
    await expect(
      deleteEvent({ tokens: { accessToken: 'AT' }, eventId: 'x' }),
    ).resolves.toBeUndefined()
  })

  it('deleteEvent treats 404 / 410 as idempotent success', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('gone', { status: 410 })) as unknown as typeof fetch
    await expect(
      deleteEvent({ tokens: { accessToken: 'AT' }, eventId: 'x' }),
    ).resolves.toBeUndefined()
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('gone', { status: 404 })) as unknown as typeof fetch
    await expect(
      deleteEvent({ tokens: { accessToken: 'AT' }, eventId: 'x' }),
    ).resolves.toBeUndefined()
  })

  it('deleteEvent throws on unexpected error', async () => {
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('bad', { status: 500 })) as unknown as typeof fetch
    await expect(
      deleteEvent({ tokens: { accessToken: 'AT' }, eventId: 'x' }),
    ).rejects.toThrow(/500/)
  })
})
