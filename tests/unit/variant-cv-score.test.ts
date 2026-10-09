import { describe, expect, it } from 'vitest'
import { computeCvScore } from '@/lib/cv-score/compute'
import type { StructureDetails } from '@/lib/cv-score/dimensions/structure'
import { cvToScorable } from '@/lib/cv-score/extract'
import { latexToText } from '@/lib/cv-score/latex-text'
import { isSkipped, type CvScoreResult } from '@/lib/cv-score/types'
import { parseResumeProfile, type ResumeProfile } from '@/lib/resume/types'
import { variantToLatex } from '@/lib/variants/latex'
import { buildRecipe } from '@/lib/variants/presets'
import { renderVariant } from '@/lib/variants/render'
import { REGIONS, TEMPLATES, type Region, type VariantTemplate } from '@/lib/variants/types'
import { extractUpload } from '@/lib/cv-score/upload'
import type { RenderedResume } from '@/lib/variants/render'
import { buildPdf, type PdfTextLine } from '@/tests/fixtures/cv-score/pdf'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

/**
 * Regression (review 2026-10-09, B.4): lee's own scorer must read the work
 * history back out of every variant template it renders. The ATS and Brand
 * templates put "location · dates" after \hfill in a {\small …} group, which
 * the LaTeX → text step used to swallow, so no role was recognised.
 */

const NOW = new Date('2026-10-09T00:00:00Z')

/** A synthetic junior (2.5 years, one role) next to the 7-year synthetic profile. */
function juniorProfile(): ResumeProfile {
  const base = syntheticProfile()
  return parseResumeProfile({
    ...base,
    basics: { ...base.basics, name: 'Ravi Kumar', email: 'ravi.kumar@example.com', location: { city: 'Kochi', countryCode: 'IN' } },
    work: [
      {
        id: 'w-junior',
        name: 'Example Payments Pvt Ltd',
        position: 'Backend Developer',
        location: 'Kochi',
        startDate: '2024-04',
        highlights: [
          { id: 'h-j1', text: 'Built Laravel payment-gateway webhooks handling 40k transactions per month.' },
          { id: 'h-j2', text: 'Cut a settlement report from 9 s to 600 ms with MySQL indexes.' },
        ],
        keywords: ['PHP', 'Laravel', 'MySQL'],
      },
      {
        id: 'w-intern',
        name: 'Example Labs',
        position: 'Software Intern',
        location: 'Kochi',
        startDate: '2023-10',
        endDate: '2024-03',
        highlights: [{ id: 'h-j3', text: 'Wrote REST endpoints for 12 merchant onboarding screens.' }],
        keywords: ['PHP'],
      },
    ],
  })
}

function score(profile: ResumeProfile, region: Region, template: VariantTemplate): { result: CvScoreResult; text: string } {
  const recipe = { ...buildRecipe(profile, { region, roleFamily: null }), template }
  const tex = variantToLatex(renderVariant(profile, recipe, { hasPhoto: false }), 1)
  const cv = cvToScorable({ kind: 'latex_cv', source: tex })
  const result = computeCvScore({
    cv,
    target: null,
    ctx: { now: NOW, canAutofix: false, region: null },
    source: { kind: 'latex_cv', label: 'variant' },
  })
  return { result, text: latexToText(tex) }
}

function structure(r: CvScoreResult): StructureDetails {
  const d = r.dimensions.structure
  if (!d || isSkipped(d)) throw new Error('structure skipped')
  return d.details as StructureDetails
}

const cases = TEMPLATES.flatMap((template) => REGIONS.map((region) => [template, region] as const))

describe('variant templates → lee CV Score (text extraction)', () => {
  it.each(cases)('%s · %s: the strong profile keeps both roles with dates and bullets', (template, region) => {
    const { result, text } = score(syntheticProfile(), region, template)
    const roles = structure(result).roles ?? []
    expect(roles.map((r) => [r.title, r.company, r.start, r.end, r.bullets])).toEqual([
      ['Backend Engineer', 'PayFlow', '2021-04', 'present', 3],
      ['Software Engineer', 'ShopKart', '2018-01', '2021-03', 2],
    ])
    expect(text).toContain('Apr 2021 – Present')
    expect(text).toContain('Jan 2018 – Mar 2021')
    expect(result.scores.structure.score).toBeGreaterThanOrEqual(85)
    expect(result.findings.map((f) => f.message).join('\n')).not.toMatch(/no work experience/i)
  })

  it.each(cases)('%s · %s: the junior profile keeps its roles too', (template, region) => {
    const { result } = score(juniorProfile(), region, template)
    const roles = structure(result).roles ?? []
    expect(roles.map((r) => [r.company, r.start, r.end])).toEqual([
      ['Example Payments Pvt Ltd', '2024-04', 'present'],
      ['Example Labs', '2023-10', '2024-03'],
    ])
    expect(result.findings.map((f) => f.message).join('\n')).not.toMatch(/no work experience/i)
  })
})

/**
 * The compiled PDF of the ATS/Brand layout, laid out the way pdflatex places
 * it: "Title — Company" on the left, "Location · Dates" right-aligned on the
 * same baseline (\hfill), bullets indented below. No TeX is installed in
 * CI, so the page is drawn from the rendered variant with the same geometry.
 */
function atsLayoutPdf(r: RenderedResume): Uint8Array {
  const lines: PdfTextLine[] = []
  let y = 790
  const put = (text: string, x = 54, size = 10): void => {
    lines.push({ text, x, y, size })
  }
  const next = (gap = 14): void => {
    y -= gap
  }
  put(r.name, 230, 16)
  next(20)
  put(r.headline, 230, 12)
  next()
  put(r.contact.map((c) => c.value).slice(0, 4).join(' · '), 80, 8)
  next(20)
  for (const s of r.sections) {
    put(s.label.toUpperCase(), 54, 11)
    next()
    for (const l of s.lines) {
      put(l)
      next()
    }
    for (const x of s.entries) {
      put(`${x.title}${x.subtitle ? ` — ${x.subtitle}` : ''}`)
      const right = [x.location, x.dates].filter(Boolean).join(' · ')
      if (right) put(right, 560 - right.length * 4.6, 9)
      next()
      for (const b of x.bullets) {
        put(`• ${b.text}`, 62, 9)
        next(12)
      }
    }
    next(6)
  }
  return buildPdf(lines.filter((l) => l.y > 20))
}

describe('variant PDF text → lee CV Score (upload extraction)', () => {
  it('reads both roles with dates from the ATS layout PDF', async () => {
    const profile = syntheticProfile()
    const recipe = { ...buildRecipe(profile, { region: 'gcc', roleFamily: null }), template: 'ats' as const }
    const pdf = atsLayoutPdf(renderVariant(profile, recipe, { hasPhoto: false }))
    const up = await extractUpload({ name: 'variant.pdf', bytes: pdf })
    const cv = cvToScorable({ kind: 'upload', ...up })
    const result = computeCvScore({
      cv,
      target: null,
      ctx: { now: NOW, canAutofix: false, region: null },
      source: { kind: 'upload', label: 'variant.pdf' },
    })
    const roles = structure(result).roles ?? []
    expect(roles.map((r) => [r.title, r.company, r.start, r.end])).toEqual([
      ['Backend Engineer', 'PayFlow', '2021-04', 'present'],
      ['Software Engineer', 'ShopKart', '2018-01', '2021-03'],
    ])
    expect(result.scores.structure.score).toBeGreaterThanOrEqual(85)
  })
})
