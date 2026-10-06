import { describe, expect, it } from 'vitest'
import { buildRecipe, REGION_PRESETS } from '@/lib/variants/presets'
import { renderVariant } from '@/lib/variants/render'
import { variantToLatex } from '@/lib/variants/latex'
import type { Recipe } from '@/lib/variants/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

const p = syntheticProfile()
const withPhoto = (region: Recipe['region'], template: Recipe['template'] = 'ats'): Recipe => {
  const r = buildRecipe(p, { region, roleFamily: null })
  return { ...r, template, fields: { ...r.fields, photo: true } }
}
const photoWarnings = (r: ReturnType<typeof renderVariant>) => r.warnings.filter((w) => /photo/i.test(w.message))

describe('photo region rules', () => {
  it('is off by default everywhere, GCC included', () => {
    expect(REGION_PRESETS.gcc.fields.photo).toBe(false)
    expect(REGION_PRESETS.india.fields.photo).toBe(false)
    expect(REGION_PRESETS.remote.fields.photo).toBe(false)
  })

  it('is placed only for GCC with the toggle on and a photo uploaded', () => {
    expect(renderVariant(p, withPhoto('gcc'), { hasPhoto: true }).photo).toBe(true)
    expect(renderVariant(p, withPhoto('gcc'), { hasPhoto: false }).photo).toBe(false)
    expect(renderVariant(p, buildRecipe(p, { region: 'gcc', roleFamily: null }), { hasPhoto: true }).photo).toBe(false)
  })

  it('is never placed for Remote / US / EU or India, whatever the toggle says', () => {
    expect(renderVariant(p, withPhoto('remote'), { hasPhoto: true }).photo).toBe(false)
    expect(renderVariant(p, withPhoto('india'), { hasPhoto: true }).photo).toBe(false)
  })

  it('warns when the toggle is on but no photo is uploaded', () => {
    expect(photoWarnings(renderVariant(p, withPhoto('gcc'), { hasPhoto: false }))).toHaveLength(1)
    expect(photoWarnings(renderVariant(p, withPhoto('gcc'), { hasPhoto: true }))).toHaveLength(0)
    expect(photoWarnings(renderVariant(p, withPhoto('remote'), { hasPhoto: false }))).toHaveLength(0)
    // Unknown (e.g. tailoring, which never prints) → no warning.
    expect(photoWarnings(renderVariant(p, withPhoto('gcc')))).toHaveLength(0)
  })
})

describe('photo in the LaTeX templates', () => {
  const rendered = (template: Recipe['template']) => renderVariant(p, withPhoto('gcc', template), { hasPhoto: true })

  it('ATS-plain places the photo beside the name block, uncoloured', () => {
    const tex = variantToLatex(rendered('ats'), 1, 'lee-photo.jpg')
    expect(tex).toContain('\\usepackage{graphicx}')
    expect(tex).toContain('\\includegraphics[width=2.6cm,height=2.6cm,keepaspectratio]{lee-photo.jpg}')
    expect(tex).toContain('\\begin{minipage}[c]{0.76\\linewidth}')
    expect(tex).not.toContain('fcolorbox')
    expect(tex).not.toContain('\\begin{center}')
  })

  it('the designed template frames it in the brand colour', () => {
    const tex = variantToLatex(rendered('brand'), 2, 'lee-photo.png')
    expect(tex).toContain('\\fcolorbox{leeglyph}{white}{\\includegraphics[width=2.6cm,height=2.6cm,keepaspectratio]{lee-photo.png}}')
    expect(tex.indexOf('\\usepackage{graphicx}')).toBeLessThan(tex.indexOf('\\begin{document}'))
  })

  it('no photo → the centred header, no graphicx', () => {
    const tex = variantToLatex(rendered('ats'), 1, null)
    expect(tex).toContain('\\begin{center}')
    expect(tex).not.toContain('graphicx')
    expect(tex).not.toContain('includegraphics')
  })

  it('only lee’s own file names are ever embedded', () => {
    for (const bad of ['../etc/passwd', 'photo.jpg}\\input{x', 'lee-photo.webp', 'lee-photo.jpg ']) {
      const tex = variantToLatex(rendered('ats'), 1, bad)
      expect(tex).not.toContain('includegraphics')
    }
  })
})
