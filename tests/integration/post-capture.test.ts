import { describe, expect, it } from 'vitest'
import * as capturesQ from '@/lib/db/queries/postCaptures'
import { captureKey, MAX_CAPTURE_TEXT, verifyCaptureKey } from '@/lib/linkedin-posts/capture'
import { CAPTURE_PAGE, handleCapture } from '@/lib/linkedin-posts/capture-handler'
import { makeUser } from '@/tests/factories'

// "Send to lee": the bookmarklet's POST target. Synthetic text only.
const ORIGIN = 'http://localhost:3100'

function post(fields: Record<string, string>, opts: { url?: string; type?: string; method?: string } = {}): Request {
  const body = new URLSearchParams(fields).toString()
  return new Request(opts.url ?? `${ORIGIN}/api/capture`, {
    method: opts.method ?? 'POST',
    headers: { 'content-type': opts.type ?? 'application/x-www-form-urlencoded', origin: 'https://www.linkedin.com' },
    ...(opts.method === 'GET' ? {} : { body }),
  })
}

const TEXT = "We're hiring a Laravel Developer in Dubai. Send your CV to careers@dunesoft.example"
const PAGE = 'https://www.linkedin.com/feed/update/urn:li:activity:7300000000000000001/'

describe('POST /api/capture', () => {
  it('parks the selection and URL for the key’s owner and redirects to the review page with nothing in the URL', async () => {
    const u = await makeUser()
    const key = captureKey(u.id, await capturesQ.keyVersion(u.id))
    const res = await handleCapture(post({ k: key, text: TEXT, url: PAGE }))
    expect(res.status).toBe(303)
    const location = res.headers.get('location')!
    expect(new URL(location).pathname).toBe(CAPTURE_PAGE)
    expect(new URL(location).search).toBe('')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const pending = await capturesQ.latestPending(u.id)
    expect(pending).toMatchObject({ text: TEXT, url: PAGE })
  })

  it('refuses a missing, forged or other user’s key (CSRF: a cross-site form without the key does nothing)', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const forged = `${u.id}.1.${'A'.repeat(43)}`
    for (const k of ['', 'nonsense', forged, captureKey(other.id, 1, 'x'.repeat(40))]) {
      const res = await handleCapture(post({ k, text: TEXT, url: PAGE }))
      expect([400, 401]).toContain(res.status)
    }
    expect(await capturesQ.latestPending(u.id)).toBeNull()
  })

  it('stops an old bookmarklet once the key is rotated', async () => {
    const u = await makeUser()
    const old = captureKey(u.id, 1)
    await capturesQ.rotateKey(u.id)
    expect((await handleCapture(post({ k: old, text: TEXT }))).status).toBe(401)
    expect((await handleCapture(post({ k: captureKey(u.id, 2), text: TEXT }))).status).toBe(303)
  })

  it('accepts nothing from the query string, only form POSTs, and caps the size', async () => {
    const u = await makeUser()
    const k = captureKey(u.id, 1)
    expect((await handleCapture(post({ k, text: TEXT }, { url: `${ORIGIN}/api/capture?text=secret` }))).status).toBe(400)
    expect((await handleCapture(post({ k, text: TEXT }, { method: 'GET' }))).status).toBe(405)
    expect((await handleCapture(post({ k, text: TEXT }, { type: 'application/json' }))).status).toBe(415)
    expect((await handleCapture(post({ k, text: 'x'.repeat(50_000) }))).status).toBe(413)
    expect((await handleCapture(post({ k, text: '', url: '' }))).status).toBe(400)
    expect((await handleCapture(post({ k, text: 'hi', url: 'javascript:alert(1)' }))).status).toBe(400)
    // Long but within the body cap: kept, cut to the text cap.
    expect((await handleCapture(post({ k, text: 'y'.repeat(MAX_CAPTURE_TEXT + 500) }))).status).toBe(303)
    expect((await capturesQ.latestPending(u.id))?.text).toHaveLength(MAX_CAPTURE_TEXT)
  })

  it('caps a chunked body without a Content-Length and strips tokens from the page link', async () => {
    const u = await makeUser()
    const k = captureKey(u.id, 1)
    const big = new URLSearchParams({ k, text: 'z'.repeat(60_000) }).toString()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        const bytes = new TextEncoder().encode(big)
        for (let i = 0; i < bytes.length; i += 8_000) c.enqueue(bytes.slice(i, i + 8_000))
        c.close()
      },
    })
    const chunked = new Request(`${ORIGIN}/api/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: stream,
      duplex: 'half',
    } as RequestInit)
    expect((await handleCapture(chunked)).status).toBe(413)

    const res = await handleCapture(post({ k, text: TEXT, url: `${PAGE.replace(/\/$/, '')}?midToken=secret&trk=x#c` }))
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect((await capturesQ.latestPending(u.id))?.url).toBe(PAGE)
    await handleCapture(post({ k, text: TEXT, url: 'https://careers.example/jobs/1?token=abc#x' }))
    expect((await capturesQ.latestPending(u.id))?.url).toBe('https://careers.example/jobs/1')
  })

  it('keeps at most five pending captures, expires them after 30 minutes and is user-scoped', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const k = captureKey(u.id, 1)
    for (let i = 0; i < 7; i++) await handleCapture(post({ k, text: `capture ${i}` }))
    expect((await capturesQ.latestPending(u.id))?.text).toBe('capture 6')
    expect(await capturesQ.latestPending(other.id)).toBeNull()
    const later = new Date(Date.now() + 31 * 60_000)
    expect(await capturesQ.latestPending(u.id, later)).toBeNull()
  })
})

describe('capture key', () => {
  it('round-trips and rejects tampering', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const k = captureKey(id, 3, 's'.repeat(40))
    expect(verifyCaptureKey(k, 's'.repeat(40))).toEqual({ userId: id, version: 3 })
    expect(verifyCaptureKey(k.replace('.3.', '.4.'), 's'.repeat(40))).toBeNull()
    expect(verifyCaptureKey(k, 't'.repeat(40))).toBeNull()
    expect(verifyCaptureKey(`${k}.x`, 's'.repeat(40))).toBeNull()
  })
})
