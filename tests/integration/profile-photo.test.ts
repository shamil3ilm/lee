import { describe, expect, it } from 'vitest'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as documentsQ from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import type { CompileOptions } from '@/lib/latex/compile'
import { compileDocumentPdf } from '@/lib/latex/pdf-cache'
import { getProfilePhoto, PhotoError, removeProfilePhoto, saveProfilePhoto } from '@/lib/resume/photo-store'
import { saveResumeProfile } from '@/lib/resume/service'
import { ensureVariantDocument } from '@/lib/variants/outputs'
import { createVariant, loadVariant, saveRecipe } from '@/lib/variants/service'
import type { Region } from '@/lib/variants/types'
import { jpegHeader, pngHeader, webpHeader } from '@/tests/fixtures/images'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeUser } from '@/tests/factories'

async function variantWithPhoto(userId: string, region: Region, photo = true): Promise<string> {
  const v = await createVariant(userId, { region, roleFamily: null })
  const { recipe } = await loadVariant(userId, v.id)
  await saveRecipe(userId, v.id, { ...recipe, fields: { ...recipe.fields, photo } })
  return v.id
}

describe('profile photo store', () => {
  it('stores a validated photo on a hidden holder document, replaces and removes it', async () => {
    const me = await makeUser()
    expect(await getProfilePhoto(me.id)).toBeNull()
    const first = await saveProfilePhoto(me.id, jpegHeader(512, 512))
    expect(first).toMatchObject({ filename: 'lee-photo.jpg', mimeType: 'image/jpeg' })
    // Not a document: the library never lists the holder.
    expect(await documentsQ.list(me.id)).toEqual([])

    const second = await saveProfilePhoto(me.id, pngHeader(400, 400))
    expect(second).toMatchObject({ filename: 'lee-photo.png', mimeType: 'image/png', documentId: first.documentId })
    expect((await assetsQ.list(me.id, first.documentId)).map((a) => a.filename)).toEqual(['lee-photo.png'])

    expect(await removeProfilePhoto(me.id)).toBe(true)
    expect(await getProfilePhoto(me.id)).toBeNull()
    expect(await removeProfilePhoto(me.id)).toBe(false)
  })

  it('refuses what the LaTeX pipeline cannot use', async () => {
    const me = await makeUser()
    await expect(saveProfilePhoto(me.id, webpHeader(512, 512))).rejects.toBeInstanceOf(PhotoError)
    await expect(saveProfilePhoto(me.id, jpegHeader(800, 600))).rejects.toThrow(/square/)
    await expect(saveProfilePhoto(me.id, Buffer.from('<svg/>'))).rejects.toBeInstanceOf(PhotoError)
    expect(await getProfilePhoto(me.id)).toBeNull()
  })

  it('is per user', async () => {
    const me = await makeUser()
    const other = await makeUser()
    await saveProfilePhoto(me.id, jpegHeader(256, 256))
    expect(await getProfilePhoto(other.id)).toBeNull()
  })
})

describe('photo in variant PDFs', () => {
  it('GCC with the toggle on: the LaTeX places it and the compile tarball carries the image', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const photo = await saveProfilePhoto(me.id, jpegHeader(512, 512))
    const id = await variantWithPhoto(me.id, 'gcc')

    const doc = await ensureVariantDocument(me.id, id)
    const { source } = latexDocumentContentSchema.parse(doc.content)
    expect(source).toContain('\\includegraphics[width=2.6cm,height=2.6cm,keepaspectratio]{lee-photo.jpg}')
    const copies = await assetsQ.listHashes(me.id, doc.id)
    expect(copies).toEqual([expect.objectContaining({ filename: 'lee-photo.jpg', sha256: photo.sha256 })])

    let sent: CompileOptions | null = null
    const compile = async (input: CompileOptions) => {
      sent = input
      return { ok: true as const, pdf: new TextEncoder().encode('%PDF-1.4 synthetic').buffer as ArrayBuffer }
    }
    const r = await compileDocumentPdf({ userId: me.id, documentId: doc.id, source, compile })
    expect(r.ok).toBe(true)
    expect(sent!.assets?.map((a) => [a.filename, a.mimeType, a.bytes.equals(jpegHeader(512, 512))])).toEqual([['lee-photo.jpg', 'image/jpeg', true]])
  })

  it('a replaced photo replaces the copy (new cache key); idempotent otherwise', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    await saveProfilePhoto(me.id, jpegHeader(512, 512))
    const id = await variantWithPhoto(me.id, 'gcc')
    const doc = await ensureVariantDocument(me.id, id)
    const before = await assetsQ.listHashes(me.id, doc.id)
    expect((await ensureVariantDocument(me.id, id)).id).toBe(doc.id)
    expect(await assetsQ.listHashes(me.id, doc.id)).toEqual(before)

    await saveProfilePhoto(me.id, pngHeader(300, 300))
    const again = await ensureVariantDocument(me.id, id)
    expect(latexDocumentContentSchema.parse(again.content).source).toContain('{lee-photo.png}')
    expect((await assetsQ.listHashes(me.id, doc.id)).map((a) => a.filename)).toEqual(['lee-photo.png'])
  })

  it('never for Remote or India, and not without the toggle or a photo', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    const gccNoPhoto = await variantWithPhoto(me.id, 'gcc')
    const noPhotoDoc = await ensureVariantDocument(me.id, gccNoPhoto)
    expect(latexDocumentContentSchema.parse(noPhotoDoc.content).source).not.toContain('includegraphics')

    await saveProfilePhoto(me.id, jpegHeader(512, 512))
    for (const [region, toggle] of [['remote', true], ['india', true], ['gcc', false]] as const) {
      const v = await variantWithPhoto(me.id, region, toggle)
      const d = await ensureVariantDocument(me.id, v)
      expect(latexDocumentContentSchema.parse(d.content).source).not.toContain('includegraphics')
      expect(await assetsQ.listHashes(me.id, d.id)).toEqual([])
    }
  })

  it('turning the toggle off drops the copy from the variant document', async () => {
    const me = await makeUser()
    await saveResumeProfile(me.id, syntheticProfile())
    await saveProfilePhoto(me.id, jpegHeader(512, 512))
    const id = await variantWithPhoto(me.id, 'gcc')
    await ensureVariantDocument(me.id, id)
    const { recipe } = await loadVariant(me.id, id)
    await saveRecipe(me.id, id, { ...recipe, fields: { ...recipe.fields, photo: false } })
    // A new version is a new document; the old one keeps its copy until removed with it.
    const doc = await ensureVariantDocument(me.id, id)
    expect(await assetsQ.listHashes(me.id, doc.id)).toEqual([])
    expect(latexDocumentContentSchema.parse(doc.content).source).not.toContain('includegraphics')
  })
})
