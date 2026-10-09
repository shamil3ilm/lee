import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { computeCvScore } from '@/lib/cv-score/compute'
import type { StructureDetails } from '@/lib/cv-score/dimensions/structure'
import { cvToScorable } from '@/lib/cv-score/extract'
import { extractUpload } from '@/lib/cv-score/upload'
import { isSkipped } from '@/lib/cv-score/types'
import { buildCvDocx, DOCX_MIME } from '@/lib/docx/build'
import { cvToDocxModel } from '@/lib/docx/from-cv'
import { variantToDocxModel } from '@/lib/docx/from-variant'
import { variantToMasterCv } from '@/lib/variants/export'
import { buildRecipe } from '@/lib/variants/presets'
import { renderVariant } from '@/lib/variants/render'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeMasterCV } from '@/tests/eval/factories'

const NOW = new Date('2026-10-09T00:00:00Z')
const p = syntheticProfile()

function variantDocx(region: 'gcc' | 'remote' = 'gcc', paper: 'a4' | 'letter' | null = null): Uint8Array {
  const recipe = { ...buildRecipe(p, { region, roleFamily: null }), paper }
  return buildCvDocx(variantToDocxModel(renderVariant(p, recipe, { hasPhoto: false })))
}

function documentXml(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)['word/document.xml']!)
}

/** Paragraph texts in order (runs joined). */
function paragraphs(xml: string): Array<{ style: string | null; text: string }> {
  return [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => ({
    style: /<w:pStyle w:val="([^"]+)"\/>/.exec(m[1]!)?.[1] ?? null,
    text: [...m[1]!.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''),
  }))
}

async function scoreDocx(bytes: Uint8Array) {
  const up = await extractUpload({ name: 'cv.docx', bytes })
  const cv = cvToScorable({ kind: 'upload', ...up })
  const result = computeCvScore({ cv, target: null, ctx: { now: NOW, canAutofix: false, region: null }, source: { kind: 'upload', label: 'cv.docx' } })
  const st = result.dimensions.structure
  if (!st || isSkipped(st)) throw new Error('structure skipped')
  return { result, structure: st.details as StructureDetails, text: up.text }
}

describe('Word (.docx) export', () => {
  it('is a valid OOXML package: content types, relationships, styles, numbering, document', () => {
    const files = unzipSync(variantDocx())
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/numbering.xml',
      'word/styles.xml',
    ])
    expect(strFromU8(files['[Content_Types].xml']!)).toContain('wordprocessingml.document.main+xml')
    expect(DOCX_MIME).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  })

  it('is ATS-friendly: single column, real headings, list bullets, no tables, text boxes or images', () => {
    const xml = documentXml(variantDocx())
    expect(xml).not.toMatch(/<w:tbl\b|<w:txbxContent|<w:drawing|<v:shape|<w:pict|<w:cols w:num="[2-9]"/)
    const ps = paragraphs(xml)
    expect(ps[0]).toEqual({ style: 'Title', text: 'Asha Menon' })
    expect(ps.filter((x) => x.style === 'Heading1').map((x) => x.text)).toEqual([
      'Summary',
      'Experience',
      'Skills',
      'Projects',
      'Education',
      'Languages',
      'Certifications',
    ])
    expect(ps.filter((x) => x.style === 'ListBullet').length).toBeGreaterThanOrEqual(5)
  })

  it('keeps the roles and bullets in order', () => {
    const texts = paragraphs(documentXml(variantDocx())).map((x) => x.text)
    const order = [
      'Backend Engineer — PayFlow | Dubai | Apr 2021 – Present',
      'Designed an idempotent payouts API in Go handling 2M+ requests per day.',
      'Led the double-entry ledger migration to PostgreSQL, cutting reconciliation errors by 85%.',
      'Integrated ZATCA e-invoicing clearance for 3 Saudi merchants.',
      'Software Engineer — ShopKart | Bengaluru | Jan 2018 – Mar 2021',
      'Built gRPC order services in TypeScript serving 30k RPS at peak.',
      'Shipped a React checkout used by 4 storefronts.',
    ]
    const at = order.map((t) => texts.indexOf(t))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('uses the variant paper size (A4 = 11906 × 16838 twips; Letter = 12240 × 15840)', () => {
    expect(documentXml(variantDocx('gcc'))).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
    expect(documentXml(variantDocx('remote'))).toContain('<w:pgSz w:w="12240" w:h="15840"/>')
    expect(documentXml(variantDocx('remote', 'a4'))).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
  })

  it('escapes XML and drops characters XML cannot hold', () => {
    const cv = makeMasterCV({ summary: 'R&D <lead> "fast" \u0001done' })
    const xml = documentXml(buildCvDocx(cvToDocxModel(cv, 'a4')))
    expect(xml).toContain('R&amp;D &lt;lead&gt; &quot;fast&quot; done')
  })

  it('is deterministic for the same input', () => {
    expect(Buffer.from(variantDocx()).equals(Buffer.from(variantDocx()))).toBe(true)
  })

  it("parses back through lee's own upload extraction: roles, dates and bullets", async () => {
    const { structure, result, text } = await scoreDocx(variantDocx())
    expect(text).toContain('• Designed an idempotent payouts API')
    expect((structure.roles ?? []).map((r) => [r.title, r.company, r.start, r.end, r.bullets])).toEqual([
      ['Backend Engineer', 'PayFlow', '2021-04', 'present', 3],
      ['Software Engineer', 'ShopKart', '2018-01', '2021-03', 2],
    ])
    expect(result.scores.structure.score).toBeGreaterThanOrEqual(85)
    expect(result.findings.map((f) => f.message).join('\n')).not.toMatch(/no work experience/i)
  })

  it('exports a tailored CV (MasterCV shape) the same way', async () => {
    const tailored = variantToMasterCv(renderVariant(p, buildRecipe(p, { region: 'india', roleFamily: null }), {}))
    const bytes = buildCvDocx(cvToDocxModel(tailored, 'a4'))
    const texts = paragraphs(documentXml(bytes)).map((x) => x.text)
    expect(texts.indexOf('Backend Engineer — PayFlow | Dubai | Apr 2021 – Present')).toBeLessThan(
      texts.indexOf('Software Engineer — ShopKart | Bengaluru | Jan 2018 – Mar 2021'),
    )
    const { structure } = await scoreDocx(bytes)
    expect((structure.roles ?? []).map((r) => [r.company, r.start, r.end])).toEqual([
      ['PayFlow', '2021-04', 'present'],
      ['ShopKart', '2018-01', '2021-03'],
    ])
  })

  it('formats ISO dates on a stored master CV', () => {
    const texts = paragraphs(documentXml(buildCvDocx(cvToDocxModel(makeMasterCV(), 'letter')))).map((x) => x.text)
    expect(texts).toContain('Senior Backend Engineer — Northwind Payments | Jun 2022 – Present')
    expect(texts).toContain('Backend Engineer — Careem | Jan 2019 – May 2022')
  })
})
