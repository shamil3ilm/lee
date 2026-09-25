import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { saveMasterCV } from '@/lib/documents/master'
import * as documentsQ from '@/lib/db/queries/documents'
import { makeApplication, makeJob, makeUser } from '@/tests/factories'
import { strongCv, weakCv } from '@/tests/fixtures/cv-score/cvs'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// Use the deterministic fixture provider for every user-scoped AI call.
vi.mock('@/lib/ai', async () => {
  const { FixtureAIProvider } = await import('@/lib/ai/fixtures')
  return { getAIProviderForUser: async () => new FixtureAIProvider() }
})

async function routes() {
  return {
    score: await import('@/app/api/cv-score/route'),
    upload: await import('@/app/api/cv-score/upload/route'),
    compare: await import('@/app/api/cv-score/compare/route'),
    batch: await import('@/app/api/cv-score/batch/route'),
    history: await import('@/app/api/cv-score/history/route'),
    preview: await import('@/app/api/cv-score/autofix/preview/route'),
    apply: await import('@/app/api/cv-score/autofix/apply/route'),
  }
}

const post = (url: string, body: unknown): Request =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

async function pdfBytes(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 800 - i * 16, size: 11, font }))
  return doc.save()
}

beforeEach(() => {
  authMock.mockReset()
})

describe('/api/cv-score auth', () => {
  it('every route returns 401 JSON without a session', async () => {
    authMock.mockResolvedValue(null)
    const r = await routes()
    const form = new FormData()
    form.set('file', new File(['x'], 'cv.txt'))
    const responses = await Promise.all([
      r.score.POST(post('/api/cv-score', { documentId: 'x' })),
      r.upload.POST(new Request('http://localhost/api/cv-score/upload', { method: 'POST', body: form })),
      r.compare.POST(post('/api/cv-score/compare', {})),
      r.batch.POST(post('/api/cv-score/batch', {})),
      r.history.GET(new Request('http://localhost/api/cv-score/history?documentId=x')),
      r.preview.POST(post('/api/cv-score/autofix/preview', {})),
      r.apply.POST(post('/api/cv-score/autofix/apply', {})),
    ])
    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Not signed in.' })
    }
  })
})

describe('/api/cv-score happy paths', () => {
  it('scores a document, then returns it in history', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const job = await makeJob(u.id, null, {
      title: 'Senior Backend Engineer',
      parsedMeta: { tech_stack: ['Postgres'], requirements: ['PostgreSQL experience'] },
    })
    const app = await makeApplication(u.id, job.id)
    const master = await saveMasterCV(u.id, strongCv())
    const r = await routes()

    const bad = await r.score.POST(post('/api/cv-score', { documentId: 'not-a-uuid' }))
    expect(bad.status).toBe(400)

    const res = await r.score.POST(post('/api/cv-score', { documentId: master.id, applicationId: app.id }))
    expect(res.status).toBe(200)
    const { result } = (await res.json()) as { result: { id: string; mode: string; total: { score: number }; scores: Record<string, unknown> } }
    expect(result.mode).toBe('jd')
    expect(Object.keys(result.scores)).toHaveLength(7)

    const h = await r.history.GET(new Request(`http://localhost/api/cv-score/history?documentId=${master.id}`))
    const { history } = (await h.json()) as { history: { id: string; overall: number; scores: Record<string, number | null> }[] }
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ id: result.id, overall: result.total.score })
    expect(history[0]!.scores.total).toBe(result.total.score)

    const missing = await r.history.GET(new Request('http://localhost/api/cv-score/history'))
    expect(missing.status).toBe(400)
  })

  it('maps domain errors to safe messages', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const r = await routes()
    const res = await r.score.POST(post('/api/cv-score', { documentId: '00000000-0000-4000-8000-000000000000' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Document not found.', code: 'document_not_found' })
  })

  it('scores an uploaded PDF (real bytes through unpdf)', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const bytes = await pdfBytes([
      'Robin Pdf',
      'robin@example.com | +44 7700 900456 | London, UK',
      'Experience',
      'Senior Engineer, Monzo, Jan 2020 - Present',
      '- Built the card payments ledger handling 2M transactions a day',
      '- Reduced incident count by 40% with better alerting',
      'Education',
      'BSc Physics, UCL, 2012 - 2015',
      'Skills',
      'Go, Postgres, Kafka',
    ])
    const form = new FormData()
    form.set('file', new File([bytes as BlobPart], 'robin.pdf', { type: 'application/pdf' }))
    const r = await routes()
    const res = await r.upload.POST(new Request('http://localhost/api/cv-score/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const { result } = (await res.json()) as {
      result: {
        source: { kind: string; label: string }
        dimensions: {
          ats: { details: { checks: { key: string; points: number }[] } }
          structure: { details: { bulletsPerRole: number[]; years: number } }
        }
      }
    }
    expect(result.source).toMatchObject({ kind: 'upload', label: 'robin.pdf' })
    // email 10 + phone 5 + location 2 (no LinkedIn in this CV)
    const contact = result.dimensions.ats.details.checks.find((c) => c.key === 'contact')
    expect(contact!.points).toBe(17)
    // Lines were rebuilt from positioned PDF items → the role and its bullets parse.
    expect(result.dimensions.structure.details.bulletsPerRole).toEqual([2])
  })

  it('rejects unsupported uploads', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const form = new FormData()
    form.set('file', new File(['MZ'], 'virus.exe'))
    const r = await routes()
    const res = await r.upload.POST(new Request('http://localhost/api/cv-score/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(415)
  })

  it('compare, batch and autofix preview/apply', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const job = await makeJob(u.id, null, { title: 'Backend Engineer', parsedMeta: { tech_stack: ['Kafka'] } })
    const app = await makeApplication(u.id, job.id, { status: 'applied' })
    const master = await saveMasterCV(u.id, weakCv())
    const tailored = await documentsQ.create(u.id, {
      applicationId: app.id, kind: 'tailored_cv', version: 1, title: 'Tailored', content: { ...strongCv(), _tailoring: { applicationId: app.id } },
    })
    const r = await routes()

    const cmp = await r.compare.POST(post('/api/cv-score/compare', { documentIdA: master.id, documentIdB: tailored.id, applicationId: app.id }))
    expect(cmp.status).toBe(200)
    const { comparison } = (await cmp.json()) as { comparison: { deltas: { key: string; delta: number | null }[] } }
    expect(comparison.deltas[0]!.key).toBe('total')

    const batch = await r.batch.POST(post('/api/cv-score/batch', {}))
    const { batch: b } = (await batch.json()) as { batch: { rows: { applicationId: string }[] } }
    expect(b.rows.map((x) => x.applicationId)).toEqual([app.id])

    const pv = await r.preview.POST(post('/api/cv-score/autofix/preview', {}))
    expect(pv.status).toBe(200)
    const { preview } = (await pv.json()) as { preview: { baseDocumentId: string; changes: unknown[] } }
    expect(preview.baseDocumentId).toBe(master.id)
    expect(preview.changes.length).toBeGreaterThan(0)

    const ap = await r.apply.POST(post('/api/cv-score/autofix/apply', { baseDocumentId: master.id, changes: preview.changes }))
    expect(ap.status).toBe(200)
    const { applied } = (await ap.json()) as { applied: { version: number } }
    expect(applied.version).toBe(2)

    const bad = await r.apply.POST(post('/api/cv-score/autofix/apply', { baseDocumentId: master.id, changes: [] }))
    expect(bad.status).toBe(400)
  })
})
