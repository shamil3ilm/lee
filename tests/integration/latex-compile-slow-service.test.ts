import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { documents } from '@/lib/db/schema'
import * as docsQ from '@/lib/db/queries/documents'
import { compileWithFallback, type FallbackDeps } from '@/lib/latex/fallback'
import { compileOnLatexOnline } from '@/lib/latex/services/latexonline'
import { compileOnYtoTech } from '@/lib/latex/services/ytotech'
import type { CompileOptions } from '@/lib/latex/compile-types'
import { makeUser } from '@/tests/factories'

// Regression: a slow or hung compile service must end in a bounded,
// user-facing failure, and must never hold the database while it waits.
// A real HTTP server stands in for both services; only the per-attempt
// timeout is shortened (production: 25 s per attempt, 45 s in all).

type Mode = 'hang' | 'stall-body' | 'ok'
let mode: Mode = 'hang'
let requests = 0
let server: Server
const sockets = new Set<import('node:net').Socket>()

const ATTEMPT_MS = 300

const fastDeps: FallbackDeps = {
  backends: {
    latexonline: (req) => compileOnLatexOnline({ ...req, timeoutMs: ATTEMPT_MS }),
    ytotech: (req) => compileOnYtoTech({ ...req, timeoutMs: ATTEMPT_MS }),
  },
  now: () => Date.now(),
}

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/latex/compile', async (orig) => ({
  ...(await orig<typeof import('@/lib/latex/compile')>()),
  compileLatex: (opts: CompileOptions) => compileWithFallback(opts, fastDeps),
}))

beforeAll(async () => {
  server = createServer((req, res) => {
    requests += 1
    req.on('data', () => {})
    req.on('end', () => {
      if (mode === 'hang') return
      if (mode === 'stall-body') {
        res.writeHead(200, { 'content-type': 'application/pdf' })
        res.write('%PDF-1.4\n') // and never ends
        return
      }
      res.writeHead(200, { 'content-type': 'application/pdf' })
      res.end('%PDF-1.4\n%%EOF\n')
    })
  })
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  process.env.LATEX_ONLINE_URL = `http://127.0.0.1:${port}/data`
  process.env.LATEX_YTOTECH_URL = `http://127.0.0.1:${port}/builds/sync`
})

afterAll(async () => {
  delete process.env.LATEX_ONLINE_URL
  delete process.env.LATEX_YTOTECH_URL
  for (const s of sockets) s.destroy()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  mode = 'hang'
  requests = 0
  authMock.mockReset()
})

async function seedDoc() {
  const u = await makeUser()
  const doc = await docsQ.create(u.id, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title: 'Slow CV',
    content: { source: '\\documentclass{article}\\begin{document}x\\end{document}' },
  })
  authMock.mockResolvedValue({ user: { id: u.id } })
  return { u, doc }
}

describe('compile against a hung service', () => {
  it('gives up per attempt, falls back once, and reports the service as unavailable', async () => {
    const started = Date.now()
    const r = await compileWithFallback({ source: 'x' }, fastDeps)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(504)
    expect(r.notes?.join(' ')).toMatch(/unavailable/)
    expect(requests).toBe(2) // latexonline.cc, then YtoTech
    expect(Date.now() - started).toBeLessThan(ATTEMPT_MS * 2 + 1_500)
  })

  it('treats a PDF body that stalls as unavailable instead of throwing', async () => {
    mode = 'stall-body'
    const r = await compileOnLatexOnline({ source: 'x', assets: [], engine: 'pdflatex', timeoutMs: ATTEMPT_MS })
    expect(r).toMatchObject({ ok: false, status: 504, service: 'latexonline' })
  })

  it('stops at once, with no further attempt, when the caller aborts', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    const r = await compileWithFallback({ source: 'x', signal: controller.signal }, {
      ...fastDeps,
      backends: {
        latexonline: (req) => compileOnLatexOnline({ ...req, timeoutMs: 10_000 }),
        ytotech: (req) => compileOnYtoTech({ ...req, timeoutMs: 10_000 }),
      },
    })
    expect(r).toMatchObject({ ok: false, status: 499 })
    expect(requests).toBe(1)
  })
})

describe('GET /api/documents/[id]/pdf with a hung compile service', () => {
  it('answers 503 with Retry-After, and the database stays usable during the compile', async () => {
    const { u, doc } = await seedDoc()
    const { GET } = await import('@/app/api/documents/[id]/pdf/route')
    const pending = GET(new Request(`http://localhost/api/documents/${doc.id}/pdf`), { params: Promise.resolve({ id: doc.id }) })
    let settled = false
    void pending.finally(() => {
      settled = true
    })

    // While the compile waits on the network, other writes and reads go
    // through: no transaction or lock spans the compile call.
    await vi.waitFor(() => expect(requests).toBeGreaterThan(0))
    await db.update(documents).set({ title: 'Renamed during compile' }).where(eq(documents.id, doc.id))
    const [row] = await db.select({ title: documents.title }).from(documents).where(eq(documents.id, doc.id))
    expect(row?.title).toBe('Renamed during compile')
    // ...before the compile has finished (a held transaction would have
    // queued both statements behind it).
    expect(settled).toBe(false)

    const res = await pending
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
    const body = (await res.json()) as { error: string; log: string }
    expect(body.error).toBe('Compile service unavailable')
    expect(body.log).toMatch(/timed out/)
    const after = await docsQ.getById(u.id, doc.id)
    expect((after!.content as { compileError?: string }).compileError).toBe('Compile failed (status 504)')
  })

  it('serves the PDF once the service answers again', async () => {
    const { doc } = await seedDoc()
    mode = 'ok'
    const { GET } = await import('@/app/api/documents/[id]/pdf/route')
    const res = await GET(new Request(`http://localhost/api/documents/${doc.id}/pdf`), { params: Promise.resolve({ id: doc.id }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
  })
})
