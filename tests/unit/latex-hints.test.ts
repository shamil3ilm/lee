import { describe, expect, it } from 'vitest'
import { extractLatexHint } from '@/lib/latex/errors'
import {
  declaredPackages,
  missingResources,
  needsUnicodeEngine,
  packageLine,
  packageUsage,
} from '@/lib/latex/missing'
import { ytotechLog } from '@/lib/latex/services/ytotech'

// The exact log latexonline.cc returned for the user's report.
const LATEXONLINE_FA5 = [
  'pdflatex -interaction nonstopmode -recorder -output-directory latex.out /tmp/downloads/tmp_1/main.tex',
  "/tmp/downloads/tmp_1/main.tex:3: error: File `fontawesome5.sty' not found",
  '      at <read *>',
  '    from \\begin{document}',
  '               ^',
  '/tmp/downloads/tmp_1/main.tex: Fatal error (no output file produced)',
].join('\n')

const preamble = (body: string) =>
  `\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage{fontawesome5}\n\\begin{document}\n${body}\n\\end{document}\n`

describe('missing-package hint', () => {
  it('never suggests adding a package the document already loads', () => {
    const hint = extractLatexHint(LATEXONLINE_FA5, preamble('Hello'))
    expect(hint?.message).not.toMatch(/^Add \\usepackage/)
    expect(hint?.message).toContain("The compile service doesn't have package fontawesome5.")
  })

  it('suggests removing the line when none of its commands are used', () => {
    const hint = extractLatexHint(LATEXONLINE_FA5, preamble('Hello % \\faGithub in a comment does not count'))
    expect(hint).toMatchObject({ kind: 'missing_package', subject: 'fontawesome5', actions: ['remove_package', 'use_fallback'] })
    expect(hint?.message).toContain('None of its commands are used: remove \\usepackage{fontawesome5}')
  })

  it('suggests the full-TeX-Live compiler (and mentions the stand-in) when the package is used', () => {
    const hint = extractLatexHint(LATEXONLINE_FA5, preamble('\\faGithub\\ example-asha'))
    expect(hint?.actions).toEqual(['use_fallback'])
    expect(hint?.message).toMatch(/Your document uses it: set Compiler to Auto or YtoTech/)
    expect(hint?.message).toContain('stand-in for fontawesome5')
  })

  it('says when a class or another package loads it', () => {
    const hint = extractLatexHint(LATEXONLINE_FA5, '\\documentclass{awesome-cv}\n\\begin{document}x\\end{document}')
    expect(hint?.message).toContain('Your document class or another package loads it')
  })

  it('without the source, offers both fixes', () => {
    const hint = extractLatexHint("! LaTeX Error: File `pdfpages.sty' not found.")
    expect(hint?.actions).toEqual(['use_fallback', 'remove_package'])
    expect(hint?.message).toContain("if you don't use it, remove \\usepackage{pdfpages}")
  })

  it('reports a missing class separately from a missing asset', () => {
    expect(extractLatexHint("! LaTeX Error: File `altacv.cls' not found.")).toMatchObject({
      kind: 'missing_class',
      subject: 'altacv',
    })
    expect(extractLatexHint("! LaTeX Error: File `photo.jpg' not found.")?.kind).toBe('missing_asset')
  })

  it('points fontspec under pdfLaTeX at the engine setting', () => {
    const log = 'fontspec.sty:28: error: Fatal fontspec error: "cannot-use-pdftex"'
    expect(extractLatexHint(log)).toMatchObject({ kind: 'wrong_engine', actions: ['switch_engine'] })
    expect(needsUnicodeEngine(log)).toBe(true)
  })
})

describe('missingResources', () => {
  it('reads packages, classes and fonts from both log formats', () => {
    expect(missingResources(LATEXONLINE_FA5)).toEqual({ packages: ['fontawesome5'], classes: [], fonts: [] })
    const raw = [
      "! LaTeX Error: File `awesome-cv.cls' not found.",
      "! LaTeX Error: File `fontawesome6.sty' not found.",
      '! Font T1/OpenSans/m/n/10=OpenSans-Regular not loadable: metric (TFM) file not found.',
    ].join('\n')
    expect(missingResources(raw)).toEqual({
      packages: ['fontawesome6'],
      classes: ['awesome-cv'],
      fonts: ['OpenSans-Regular'],
    })
    expect(missingResources('! Undefined control sequence.')).toEqual({ packages: [], classes: [], fonts: [] })
  })
})

describe('package usage', () => {
  const src = [
    '\\documentclass{article}',
    '\\usepackage[dvipsnames]{xcolor}',
    '\\usepackage{fontawesome5, paracol}',
    '% \\usepackage{eso-pic}',
    '\\begin{document}',
    '\\begin{paracol}{2} x \\end{paracol}',
    '\\end{document}',
  ].join('\n')

  it('lists declared packages, ignoring comments', () => {
    expect(declaredPackages(src)).toEqual(['xcolor', 'fontawesome5', 'paracol'])
  })

  it('tells used, unused and unknown packages apart', () => {
    expect(packageUsage(src, 'paracol')).toBe('used')
    expect(packageUsage(src, 'fontawesome5')).toBe('unused')
    expect(packageUsage(src, 'somethingelse')).toBe('unknown')
  })

  it('finds the line that loads a package', () => {
    expect(packageLine(src, 'fontawesome5')).toBe(3)
    expect(packageLine(src, 'eso-pic')).toBeNull()
  })
})

describe('ytotechLog', () => {
  it('returns the TeX log with the internal main-file name mapped to main.tex', () => {
    const body = JSON.stringify({
      error: 'COMPILATION_ERROR',
      log_files: { '__main_document__.log': "./__main_document__.tex:3: LaTeX Error: File `x.sty' not found." },
      logs: 'latexmk output',
    })
    expect(ytotechLog(body)).toBe("./main.tex:3: LaTeX Error: File `x.sty' not found.")
  })

  it('falls back to latexmk output, the error code, or the raw body', () => {
    expect(ytotechLog(JSON.stringify({ logs: 'only latexmk' }))).toBe('only latexmk')
    expect(ytotechLog(JSON.stringify({ error: 'SERVER_ERROR' }))).toBe('SERVER_ERROR')
    expect(ytotechLog('<html>502</html>')).toBe('<html>502</html>')
  })
})
