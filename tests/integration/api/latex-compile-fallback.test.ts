import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as docsQ from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { decodeNotesHeader } from '@/lib/latex/compile-settings'
import { makeUser } from '@/tests/factories'

/**
 * POST /api/latex/compile end to end, with the two compile services faked
 * at the HTTP layer: latexonline.cc answers like it does for a document that
 * loads fontawesome5, YtoTech answers with a PDF (or is down).
 */

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

const SOURCE = '\\documentclass{article}\n\\usepackage{fontawesome5}\n\\begin{document}\\faGithub{} x\\end{document}\n'
const FA5_LOG = "/tmp/downloads/t/main.tex:2: error: File `fontawesome5.sty' not found\n      at <read *>\n"
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49])

type Calls = { url: string; init?: RequestInit }[]
const originalFetch = globalThis.fetch
let calls: Calls = []

function fakeServices(opts: { ytotech: 'pdf' | 'down' }): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.startsWith('https://latexonline.cc/')) {
      const tar = await new Response(init?.body as FormData).text()
      // The stand-in .sty travels in the tarball on the shim retry.
      if (tar.includes('fontawesome5.sty')) return new Response(PDF, { status: 200 })
      return new Response(FA5_LOG, { status: 400 })
    }
    if (url.startsWith('https://latex.ytotech.com/')) {
      if (opts.ytotech === 'down') return new Response('<html>502 Bad Gateway</html>', { status: 502 })
      return new Response(PDF, { status: 201, headers: { 'content-type': 'application/pdf' } })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch
}

async function seed() {
  const u = await makeUser()
  const doc = await docsQ.create(u.id, { applicationId: null, kind: 'latex_cv', version: 1, title: 'CV', content: { source: SOURCE } })
  authMock.mockResolvedValue({ user: { id: u.id } })
  return { u, doc }
}

function post(body: Record<string, unknown>) {
  return new Request('http://localhost/api/latex/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  calls = []
  authMock.mockReset()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('compile fallback selection', () => {
  it('auto: a package missing on latexonline.cc compiles on YtoTech, with a note', async () => {
    fakeServices({ ytotech: 'pdf' })
    const { u, doc } = await seed()
    const { POST } = await import('@/app/api/latex/compile/route')
    const res = await POST(post({ documentId: doc.id, source: SOURCE }))
    expect(res.status).toBe(200)
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...PDF])
    expect(res.headers.get('x-lee-compile-service')).toBe('ytotech')
    expect(decodeNotesHeader(res.headers.get('x-lee-compile-notes'))).toEqual([
      "latexonline.cc doesn't have package fontawesome5; compiled on YtoTech (full TeX Live) instead.",
    ])
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['latexonline.cc', 'latex.ytotech.com'])
    const sent = JSON.parse(String(calls[1]!.init?.body)) as { compiler: string; resources: { main?: boolean; content?: string }[] }
    expect(sent.compiler).toBe('pdflatex')
    expect(sent.resources[0]).toMatchObject({ main: true, content: SOURCE })

    // The same PDF cache serves the next compile without any service call.
    calls = []
    const again = await POST(post({ documentId: doc.id, source: SOURCE }))
    expect(again.status).toBe(200)
    expect(calls).toHaveLength(0)

    const saved = latexDocumentContentSchema.parse((await docsQ.getById(u.id, doc.id))!.content)
    expect(saved.compileSettings).toEqual({ service: 'auto', engine: 'pdflatex' })
    expect(saved.compileError).toBeUndefined()
  })

  it('auto with YtoTech down: the bundled stand-in compiles on latexonline.cc', async () => {
    fakeServices({ ytotech: 'down' })
    const { doc } = await seed()
    const { POST } = await import('@/app/api/latex/compile/route')
    const res = await POST(post({ documentId: doc.id, source: SOURCE }))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-lee-compile-service')).toBe('latexonline')
    expect(decodeNotesHeader(res.headers.get('x-lee-compile-notes'))).toContain(
      "fontawesome5 isn't available on the compile service; icons shown as text.",
    )
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['latexonline.cc', 'latex.ytotech.com', 'latexonline.cc'])
  })

  it('a manual choice is saved and honoured: YtoTech only, XeLaTeX', async () => {
    fakeServices({ ytotech: 'pdf' })
    const { u, doc } = await seed()
    const { POST } = await import('@/app/api/latex/compile/route')
    const settings = { service: 'ytotech', engine: 'xelatex' }
    const res = await POST(post({ documentId: doc.id, source: SOURCE, settings }))
    expect(res.status).toBe(200)
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['latex.ytotech.com'])
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({ compiler: 'xelatex' })
    const saved = latexDocumentContentSchema.parse((await docsQ.getById(u.id, doc.id))!.content)
    expect(saved.compileSettings).toEqual(settings)
  })

  it('latexonline.cc only, stand-in failing too: 422 with the log and the notes', async () => {
    globalThis.fetch = (async (input: unknown) => {
      calls.push({ url: String(input) })
      return new Response(FA5_LOG, { status: 400 })
    }) as typeof fetch
    const { doc } = await seed()
    const { POST } = await import('@/app/api/latex/compile/route')
    const res = await POST(post({ documentId: doc.id, source: SOURCE, settings: { service: 'latexonline', engine: 'pdflatex' } }))
    expect(res.status).toBe(422)
    const body = (await res.json()) as { log: string; notes: string[] }
    expect(body.log).toContain("File `fontawesome5.sty' not found")
    expect(body.notes).toEqual(["fontawesome5 isn't available on the compile service; icons shown as text."])
    expect(calls.every((c) => c.url.startsWith('https://latexonline.cc/'))).toBe(true)
  })
})
