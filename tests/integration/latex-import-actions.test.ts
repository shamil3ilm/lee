import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as docsQ from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const SOURCE = '\\documentclass{article}\\begin{document}x\\end{document}'

beforeEach(() => sessionMock.mockReset())

describe('project import actions', () => {
  it('creates a LaTeX document with the main file path and the preselected compiler', async () => {
    const u = await makeUser(`import-${Math.random()}@x.com`)
    sessionMock.mockResolvedValue(u.id)
    const { createImportedLatexDocument } = await import('@/app/(authed)/documents/import-actions')
    const out = await createImportedLatexDocument({ title: 'thesis', source: SOURCE, mainFile: 'src/thesis.tex', settings: { engine: 'xelatex' } })
    if (!('documentId' in out)) throw new Error(out.error)
    const doc = await docsQ.getById(u.id, out.documentId)
    expect(doc?.kind).toBe('latex_cv')
    expect(doc?.title).toBe('thesis')
    const content = latexDocumentContentSchema.parse(doc!.content)
    expect(content).toMatchObject({ source: SOURCE, mainFile: 'src/thesis.tex', compileSettings: { engine: 'xelatex', service: 'auto' } })
  })

  it('omits main.tex as the main file and rejects unsafe paths', async () => {
    const u = await makeUser(`import-${Math.random()}@x.com`)
    sessionMock.mockResolvedValue(u.id)
    const { createImportedLatexDocument } = await import('@/app/(authed)/documents/import-actions')
    const out = await createImportedLatexDocument({ title: 'cv', source: SOURCE, mainFile: 'main.tex' })
    if (!('documentId' in out)) throw new Error(out.error)
    const doc = await docsQ.getById(u.id, out.documentId)
    expect(latexDocumentContentSchema.parse(doc!.content).mainFile).toBeUndefined()
    expect(await createImportedLatexDocument({ title: 'x', source: SOURCE, mainFile: '../evil.tex' })).toEqual({
      error: 'The imported project could not be read.',
    })
  })

  it('records the main file and compiler on "Replace project", keeping the source', async () => {
    const u = await makeUser(`import-${Math.random()}@x.com`)
    sessionMock.mockResolvedValue(u.id)
    const doc = await docsQ.create(u.id, { applicationId: null, kind: 'latex_cv', version: 1, title: 'CV', content: { source: SOURCE } })
    const { saveImportedProjectMeta } = await import('@/app/(authed)/documents/import-actions')
    expect(await saveImportedProjectMeta({ documentId: doc.id, mainFile: 'cv.tex', settings: { engine: 'lualatex', service: 'ytotech' } })).toEqual({ success: true })
    let content = latexDocumentContentSchema.parse((await docsQ.getById(u.id, doc.id))!.content)
    expect(content).toMatchObject({ source: SOURCE, mainFile: 'cv.tex', compileSettings: { engine: 'lualatex', service: 'ytotech' } })
    await saveImportedProjectMeta({ documentId: doc.id, mainFile: null })
    content = latexDocumentContentSchema.parse((await docsQ.getById(u.id, doc.id))!.content)
    expect(content.mainFile).toBeUndefined()
    expect(content.compileSettings?.engine).toBe('lualatex')
  })
})
