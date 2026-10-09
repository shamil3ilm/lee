import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import * as documentsQ from '@/lib/db/queries/documents'
import { documentDocx, DocxExportError, variantDocx } from '@/lib/docx/service'
import { masterCvSchema } from '@/lib/documents/types'
import { saveResumeProfile } from '@/lib/resume/service'
import { createVariant, saveRecipe, loadVariant } from '@/lib/variants/service'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeUser } from '@/tests/factories'

const xmlOf = (bytes: Uint8Array): string => strFromU8(unzipSync(bytes)['word/document.xml']!)

describe('docx export service', () => {
  it("exports a variant's saved version on its paper, named after the person and variant", async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const v = await createVariant(me.id, { region: 'remote', roleFamily: null, name: 'Remote · General' })
    const first = await variantDocx(me.id, v.id)
    expect(first.filename).toBe('Asha Menon - CV Remote · General v1.docx')
    expect(xmlOf(first.bytes)).toContain('<w:pgSz w:w="12240" w:h="15840"/>')

    const { recipe } = await loadVariant(me.id, v.id)
    await saveRecipe(me.id, v.id, { ...recipe, paper: 'a4' })
    const second = await variantDocx(me.id, v.id)
    expect(second.filename).toContain('v2.docx')
    expect(xmlOf(second.bytes)).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
    expect(xmlOf(second.bytes)).toMatch(/Backend Engineer — PayFlow<\/w:t>.*? \| Dubai \| Apr 2021 – Present/)
  })

  it('exports master and tailored CV documents, and refuses other kinds and other users', async () => {
    const me = await makeUser()
    const other = await makeUser()
    const cv = masterCvSchema.parse({
      basics: { name: 'Asha Menon', headline: 'Backend Engineer' },
      experience: [{ company: 'PayFlow', role: 'Backend Engineer', start: '2021-04', end: 'present', bullets: ['Cut settlement latency by 40%.'] }],
      skills: { primary: ['Go'] },
    })
    const tailored = await documentsQ.create(me.id, {
      applicationId: null,
      kind: 'tailored_cv',
      version: 1,
      title: 'Tailored CV v1',
      content: { ...cv, _tailoring: { applicationId: 'x' } },
    })
    const out = await documentDocx(me.id, tailored.id)
    expect(out.filename).toBe('Asha Menon - Tailored CV v1.docx')
    expect(xmlOf(out.bytes)).toMatch(/Backend Engineer — PayFlow<\/w:t>.*? \| Apr 2021 – Present/)
    expect(xmlOf(out.bytes)).toContain('<w:pgSz w:w="11906" w:h="16838"/>')

    await expect(documentDocx(other.id, tailored.id)).rejects.toMatchObject({ status: 404 })
    const letter = await documentsQ.create(me.id, {
      applicationId: null,
      kind: 'cover_letter',
      version: 1,
      title: 'Letter',
      content: { applicationId: 'x', greeting: 'Hi', paragraphs: ['p'], closing: 'Best', senderName: 'A' },
    })
    await expect(documentDocx(me.id, letter.id)).rejects.toBeInstanceOf(DocxExportError)
    await expect(documentDocx(me.id, letter.id)).rejects.toMatchObject({ status: 415 })
  })
})
