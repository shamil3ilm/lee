import { describe, expect, it } from 'vitest'
import { parseResumeProfile } from '@/lib/resume/types'
import { variantToLatex } from '@/lib/variants/latex'
import { renderVariant } from '@/lib/variants/render'
import { recipeSchema } from '@/lib/variants/types'

/**
 * ATS-safe text extraction: with pdfLaTeX, ligatures (fi, fl, ffi) extract
 * as single glyphs ("certiﬁed") unless the PDF carries a ToUnicode map
 * (`\input{glyphtounicode}` + `\pdfgentounicode=1`). Exact-term search for
 * "certified" or "workflow" then misses.
 *
 * Limit: compiling needs the network (latexonline.cc; no TeX on CI or this
 * machine), so this tests the generated source of all three templates:
 * the map is enabled under pdfTeX before \begin{document}, and the words
 * reach the source as plain letters (no ligature code points), so the
 * compiled PDF's text layer maps them back to "fi" / "fl".
 */

const LIGATURES = /[ﬀ-ﬆ]/

const profile = parseResumeProfile({
  basics: { name: 'Rae Example', label: 'Backend Engineer', email: 'rae@example.com' },
  work: [
    {
      id: 'w1',
      name: 'PayCo',
      position: 'Backend Engineer',
      startDate: '2023-01',
      highlights: [{ id: 'h1', text: 'Certified the official workflow profile for finance offline reconciliation.' }],
    },
  ],
  skills: [{ id: 'g', name: 'Skills', skills: [{ id: 's', name: 'Laravel' }] }],
})

function tex(template: 'ats' | 'brand' | 'classic'): string {
  const recipe = recipeSchema.parse({ region: 'remote', template, work: [{ id: 'w1', highlights: [{ id: 'h1' }] }], skills: ['s'] })
  return variantToLatex(renderVariant(profile, recipe, { hasPhoto: false }), 1)
}

describe.each(['ats', 'brand', 'classic'] as const)('%s template', (template) => {
  const source = tex(template)
  const preamble = source.slice(0, source.indexOf('\\begin{document}'))

  it('maps glyphs to Unicode under pdfLaTeX, in the preamble', () => {
    expect(preamble).toContain('\\input{glyphtounicode}')
    expect(preamble).toContain('\\pdfgentounicode=1')
    expect(preamble).toMatch(/\\ifPDFTeX[\s\S]*\\input\{glyphtounicode\}[\s\S]*\\pdfgentounicode=1[\s\S]*\\fi/)
    expect(preamble).toContain('\\usepackage{iftex}')
  })

  it('keeps ligature words as plain letters in the text', () => {
    expect(source).toContain('Certified the official workflow profile for finance offline reconciliation.')
    expect(LIGATURES.test(source)).toBe(false)
  })
})
