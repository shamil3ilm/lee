import { describe, it, expect } from 'vitest'
import {
  attachedComment,
  buildAssetSnippet,
  certificatesBlock,
  defaultSnippetForAsset,
  includegraphics,
  includePdf,
  inputBlock,
  insertVariants,
  logoBlock,
  photoBlock,
} from '@/lib/latex/snippets'

const img = { filename: 'photo.jpg', mimeType: 'image/jpeg' }
const pdf = { filename: 'cover.pdf', mimeType: 'application/pdf' }
const bib = { filename: 'refs.bib', mimeType: 'application/x-bibtex' }
const bin = { filename: 'weird.zip', mimeType: 'application/zip' }

describe('snippet helpers', () => {
  it('includegraphics defaults to 30% textwidth and clamps to [0.05, 1]', () => {
    expect(includegraphics('a.jpg')).toBe('\\includegraphics[width=0.3\\textwidth]{a.jpg}')
    expect(includegraphics('a.jpg', 0.5)).toBe(
      '\\includegraphics[width=0.5\\textwidth]{a.jpg}',
    )
    expect(includegraphics('a.jpg', 2)).toContain('width=1\\textwidth')
    expect(includegraphics('a.jpg', 0)).toContain('width=0.05\\textwidth')
  })

  it('photoBlock produces a centred 3cm block', () => {
    const out = photoBlock('me.jpg')
    expect(out).toContain('\\begin{center}')
    expect(out).toContain('\\includegraphics[width=3cm]{me.jpg}')
    expect(out).toContain('\\end{center}')
  })

  it('logoBlock is inline with 1cm height', () => {
    expect(logoBlock('logo.png')).toContain('height=1cm')
    expect(logoBlock('logo.png')).toContain('logo.png')
  })

  it('certificatesBlock — single vs multiple filenames', () => {
    expect(certificatesBlock([])).toBe('')
    expect(certificatesBlock(['a.pdf'])).toBe('\\includepdf[pages=-]{a.pdf}')
    const many = certificatesBlock(['a.pdf', 'b.pdf'])
    expect(many).toContain('\\section*{Certificates}')
    expect(many).toContain('\\includepdf[pages=-]{a.pdf}')
    expect(many).toContain('\\includepdf[pages=-]{b.pdf}')
  })

  it('includePdf / inputBlock / attachedComment shapes', () => {
    expect(includePdf('cv.pdf')).toBe('\\includepdf[pages=-]{cv.pdf}')
    expect(inputBlock('preamble.tex')).toBe('\\input{preamble.tex}')
    expect(attachedComment('x.zip')).toBe('% attached: x.zip')
  })

  it('insertVariants returns image variants for images', () => {
    const variants = insertVariants(img)
    expect(variants.map((v) => v.id)).toEqual(['includegraphics', 'photo', 'logo'])
  })

  it('insertVariants returns includepdf for pdfs', () => {
    expect(insertVariants(pdf).map((v) => v.id)).toEqual(['includepdf'])
  })

  it('insertVariants returns input+raw for text-like MIME types', () => {
    expect(insertVariants(bib).map((v) => v.id)).toEqual(['input', 'raw'])
  })

  it('insertVariants returns raw comment only for unknown types', () => {
    expect(insertVariants(bin).map((v) => v.id)).toEqual(['raw'])
  })

  it('buildAssetSnippet dispatches to the right helper per variant', () => {
    expect(buildAssetSnippet(img, 'includegraphics')).toContain('\\includegraphics')
    expect(buildAssetSnippet(img, 'photo')).toContain('\\begin{center}')
    expect(buildAssetSnippet(img, 'logo')).toContain('height=1cm')
    expect(buildAssetSnippet(pdf, 'includepdf')).toBe('\\includepdf[pages=-]{cover.pdf}')
    expect(buildAssetSnippet(bib, 'input')).toBe('\\input{refs.bib}')
    expect(buildAssetSnippet(bin, 'raw')).toBe('% attached: weird.zip')
  })

  it('defaultSnippetForAsset picks a sensible default per MIME', () => {
    expect(defaultSnippetForAsset(img)).toContain('\\includegraphics')
    expect(defaultSnippetForAsset(pdf)).toContain('\\includepdf')
    expect(defaultSnippetForAsset(bin)).toContain('% attached:')
  })
})
