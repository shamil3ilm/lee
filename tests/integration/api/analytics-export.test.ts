import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'
import { _internal, isExportMetric } from '@/lib/analytics/csv'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

async function importRoute() {
  return import('@/app/api/analytics/export/[metric]/route')
}

beforeEach(() => {
  authMock.mockReset()
})

describe('isExportMetric', () => {
  it('accepts every known metric slug', () => {
    for (const m of [
      'source-funnel',
      'response-time',
      'time-to-outcome',
      'discovery-calibration',
      'weekly-activity',
      'status-distribution',
    ]) {
      expect(isExportMetric(m)).toBe(true)
    }
  })
  it('rejects unknown or malformed slugs', () => {
    expect(isExportMetric('nope')).toBe(false)
    expect(isExportMetric('')).toBe(false)
    expect(isExportMetric('SOURCE-FUNNEL')).toBe(false)
  })
})

describe('csv escaping', () => {
  const { escapeCell, serialiseCsv } = _internal
  it('leaves plain strings and numbers alone', () => {
    expect(escapeCell('hello')).toBe('hello')
    expect(escapeCell(42)).toBe('42')
  })
  it('quotes and escapes commas, quotes, and newlines', () => {
    expect(escapeCell('a,b')).toBe('"a,b"')
    expect(escapeCell('he said "hi"')).toBe('"he said ""hi"""')
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCell(' leading')).toBe('" leading"')
  })
  it('serialises a table with CRLF line endings and trailing newline', () => {
    const out = serialiseCsv({
      columns: ['a', 'b'],
      rows: [
        [1, 'x'],
        [2, 'y,z'],
      ],
    })
    expect(out).toBe('a,b\r\n1,x\r\n2,"y,z"\r\n')
  })
})

describe('GET /api/analytics/export/[metric]', () => {
  it('returns 401 when not signed in', async () => {
    authMock.mockResolvedValueOnce(null)
    const { GET } = await importRoute()
    const res = await GET(new Request('http://localhost/api/analytics/export/source-funnel'), {
      params: Promise.resolve({ metric: 'source-funnel' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 for an unknown metric', async () => {
    const u = await makeUser()
    authMock.mockResolvedValueOnce({ user: { id: u.id } })
    const { GET } = await importRoute()
    const res = await GET(new Request('http://localhost/api/analytics/export/unknown'), {
      params: Promise.resolve({ metric: 'unknown' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns a text/csv attachment with data for the current user', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    await makeApplication(u.id, j.id, { source: 'linkedin', status: 'applied' })
    await makeApplication(u.id, j.id, { source: 'linkedin', status: 'offer' })

    authMock.mockResolvedValue({ user: { id: u.id } })
    const { GET } = await importRoute()
    const res = await GET(new Request('http://localhost/api/analytics/export/source-funnel'), {
      params: Promise.resolve({ metric: 'source-funnel' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const text = await res.text()
    expect(text.split('\r\n')[0]).toBe('source,applied,screened,interviewed,offered,rejected')
    // linkedin row: applied bucket = 2 (applied + offer), screened=1, interviewed=1, offered=1
    expect(text).toContain('linkedin,2,1,1,1,0')
  })

  it('scopes export to the authenticated user (no data leaks across users)', async () => {
    const other = await makeUser()
    const c = await makeCompany(other.id)
    const j = await makeJob(other.id, c.id)
    await makeApplication(other.id, j.id, { source: 'linkedin', status: 'applied' })

    const me = await makeUser()
    authMock.mockResolvedValueOnce({ user: { id: me.id } })
    const { GET } = await importRoute()
    const res = await GET(new Request('http://localhost/api/analytics/export/source-funnel'), {
      params: Promise.resolve({ metric: 'source-funnel' }),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    // Only the header row, no data
    expect(text.split('\r\n').filter(Boolean).length).toBe(1)
  })
})
