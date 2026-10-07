import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLASSIC_PREAMBLE, classicLink, displayUrl, hrefUrl } from '@/lib/latex/classic-layout'
import { fillTemplate } from '@/lib/latex/templates'
import { buildRecipe } from '@/lib/variants/presets'
import { renderVariant, type RenderedResume } from '@/lib/variants/render'
import { variantToLatex } from '@/lib/variants/latex'
import { TEMPLATES, type Recipe } from '@/lib/variants/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import { makeMasterCV } from '@/tests/eval/factories'

const p = syntheticProfile()

function classicRecipe(region: Recipe['region'], photo = false): Recipe {
  const r = buildRecipe(p, { region, roleFamily: null })
  return { ...r, template: 'classic', fields: { ...r.fields, photo } }
}

const remote = (): RenderedResume => renderVariant(p, classicRecipe('remote'), { hasPhoto: false })

describe('Classic résumé variant template', () => {
  it('is offered next to ats and brand', () => {
    expect(TEMPLATES).toEqual(['ats', 'brand', 'classic'])
  })

  it('renders the synthetic profile to a stable source', async () => {
    await expect(variantToLatex(remote(), 1)).toMatchFileSnapshot('./__snapshots__/variant-classic.tex.snap')
  })

  it('uses the Classic preamble: Charter, titlesec, paracol entries, no icon packages', () => {
    const tex = variantToLatex(remote(), 1)
    expect(tex).toContain('\\documentclass[10pt, letterpaper]{article}')
    expect(tex).toContain('\\usepackage{charter}')
    expect(tex).toContain('[\\vspace{1pt}\\titlerule]')
    expect(tex).toContain('\\begin{twocolentry}{\\textit{Apr 2021 – Present}}')
    expect(tex).toContain('\\begin{highlights}')
    expect(tex).not.toMatch(/fontawesome|eso-pic/)
    expect(tex).toContain('{\\fontsize{22pt}{22pt}\\bfseries ASHA MENON}')
  })

  it('places the photo top right only when the variant allows it, else the header takes the full width', () => {
    const withPhoto = renderVariant(p, classicRecipe('gcc', true), { hasPhoto: true })
    expect(withPhoto.photo).toBe(true)
    const placed = variantToLatex(withPhoto, 1, 'lee-photo.jpg')
    expect(placed).toContain('\\begin{minipage}[c]{0.78\\textwidth}')
    expect(placed).toContain('\\includegraphics[width=2.5cm,height=2.5cm,keepaspectratio]{lee-photo.jpg}')

    const none = variantToLatex(remote(), 1)
    expect(none).toContain('\\begin{minipage}[c]{\\textwidth}')
    expect(none).not.toContain('\\includegraphics')

    // A photo name that is not lee's own file is never embedded.
    expect(variantToLatex(withPhoto, 1, '../../etc/passwd')).not.toContain('\\includegraphics')
  })

  it('escapes every user string and links only safe URLs', () => {
    const r = remote()
    const tricky: RenderedResume = {
      ...r,
      name: 'Asha & Co_50%',
      headline: 'C# / C++ {lead} ~ ^ \\',
      contact: [
        { field: 'email', label: 'Email', value: 'a_b@example.com' },
        { field: 'url', label: 'Website', value: 'https://x.dev/}\\input{x}' },
        { field: 'visaStatus', label: 'Visa', value: '100% remote' },
      ],
      sections: [
        {
          key: 'work',
          label: 'Experience',
          lines: [],
          entries: [
            {
              id: 'w',
              title: 'Dev & Ops',
              subtitle: 'R$D_Co',
              location: '#1 City',
              dates: 'Jan 2020 – Present',
              keywords: [],
              bullets: [{ text: 'Cut costs 30% for $5k {budget}', mode: 'full' }],
            },
          ],
        },
      ],
    }
    const tex = variantToLatex(tricky, 1)
    expect(tex).toContain('ASHA \\& CO\\_50\\%')
    expect(tex).toContain('C\\# / C++ \\{lead\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}')
    expect(tex).toContain('\\href{mailto:a_b@example.com}{a\\_b@example.com}')
    expect(tex).not.toContain('\\input{x}')
    expect(tex).toContain('Visa:~100\\% remote')
    expect(tex).toContain('\\textbf{Dev \\& Ops} \\\\\n    R\\$D\\_Co, \\#1 City')
    expect(tex).toContain('\\item Cut costs 30\\% for \\$5k \\{budget\\}')
  })

  it('puts education dates in the right column', () => {
    const tex = variantToLatex(remote(), 1)
    expect(tex).toContain(
      '\\begin{twocolentry}{2014 – 2018}\n    \\textbf{B.Tech in Computer Science} \\\\\n    \\textit{Example Institute of Technology}',
    )
  })
})

describe('Classic gallery template', () => {
  it('shares the variant preamble exactly', () => {
    const file = readFileSync(path.join(process.cwd(), 'lib/latex/templates/cv-classic.tex'), 'utf8')
    expect(file).toContain(CLASSIC_PREAMBLE)
  })

  it('fills from a master CV with every placeholder replaced', () => {
    const tex = fillTemplate('cv-classic', makeMasterCV())
    expect(tex).not.toMatch(/\{\{[a-z_]+\}\}/)
    expect(tex).toContain('\\section{EXPERIENCE}')
    expect(tex).toContain('\\textit{Jun 2022 – Present}')
    expect(tex).toContain('\\href{https://linkedin.com/in/shamil}{linkedin.com/in/shamil}')
  })

  it('stays compilable with an empty master CV', () => {
    const tex = fillTemplate('cv-classic', {
      basics: { name: 'Your Name', headline: 'Your Headline' },
      summary: '',
      experience: [],
      skills: { primary: [] },
    })
    expect(tex).not.toContain('\\section{EXPERIENCE}')
    expect(tex).toContain('YOUR NAME')
  })
})

describe('Classic links', () => {
  it('accepts http(s), mailto and tel URLs and escapes % and #', () => {
    expect(hrefUrl('https://example.dev/a?b=1#top')).toBe('https://example.dev/a?b=1\\#top')
    expect(hrefUrl('https://example.dev/100%25')).toBe('https://example.dev/100\\%25')
    expect(hrefUrl('mailto:asha@example.com')).toBe('mailto:asha@example.com')
    expect(hrefUrl('tel:+971500000000')).toBe('tel:+971500000000')
  })

  it('rejects URLs that could break out of \\href', () => {
    expect(hrefUrl('javascript:alert(1)')).toBeNull()
    expect(hrefUrl('https://x.dev/}\\input{secret}')).toBeNull()
    expect(hrefUrl('https://x.dev/a b')).toBeNull()
    expect(hrefUrl('example.dev')).toBeNull()
  })

  it('falls back to escaped plain text for an unsafe URL', () => {
    expect(classicLink('https://x.dev/{bad}', 'x_y')).toBe('x\\_y')
    expect(classicLink('https://x.dev', 'x_y')).toBe('\\href{https://x.dev}{x\\_y}')
  })

  it('shows URLs without scheme, www or trailing slash', () => {
    expect(displayUrl('https://www.linkedin.com/in/example-asha/')).toBe('linkedin.com/in/example-asha')
    expect(displayUrl('http://asha.example.dev')).toBe('asha.example.dev')
  })
})
