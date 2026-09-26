import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { isMainFile, parseLatexLog, rejoinWrappedLines } from '@/lib/latex/errors'

// Two families of real-shaped logs:
// - latexonline-*.log: verbatim response bodies from latexonline.cc (the
//   production compile service), captured 2026-09-26. It post-processes the
//   pdflatex log into `file:line: error: message` + indented context.
// - pdflatex-*.log: raw pdflatex .log layout (hard-wrapped at 79 columns,
//   `!` errors with `l.<n>`, `(`/`)` file stack) for in-browser TeX (§8.5 #14).
function fixture(name: string): string {
  return readFileSync(path.join(__dirname, '..', 'fixtures', 'latex-logs', `${name}.log`), 'utf8')
}

describe('rejoinWrappedLines', () => {
  it('joins a 79-column line with the line that follows it', () => {
    const a = 'x'.repeat(79)
    expect(rejoinWrappedLines([a, 'tail', 'next'])).toEqual([`${a}tail`, 'next'])
  })

  it('keeps shorter lines as they are', () => {
    expect(rejoinWrappedLines(['short', 'lines'])).toEqual(['short', 'lines'])
  })

  it('joins a line wrapped more than once', () => {
    const a = 'a'.repeat(79)
    const b = 'b'.repeat(79)
    expect(rejoinWrappedLines([a, b, 'c'])).toEqual([`${a}${b}c`])
  })
})

describe('parseLatexLog — latexonline.cc format', () => {
  it('undefined control sequence: line and context', () => {
    const { errors } = parseLatexLog(fixture('latexonline-undefined-control-sequence'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      severity: 'error',
      message: 'Undefined control sequence',
      file: 'main.tex',
      line: 5,
    })
    expect(errors[0]!.context).toContain('\\foobarbaz')
  })

  it('missing brace: error without a line number, emergency stop kept', () => {
    const { errors } = parseLatexLog(fixture('latexonline-missing-brace'))
    expect(errors[0]).toMatchObject({
      message: 'File ended while scanning use of \\textbf',
      file: 'main.tex',
      line: null,
    })
    expect(errors.map((e) => e.message)).toContain(
      'Emergency stop: job aborted, no legal \\end found',
    )
    // "Fatal error (no output file produced)" is a summary, not a problem.
    expect(errors.some((e) => /Fatal error/.test(e.message))).toBe(false)
  })

  it('missing file: both the graphic and the \\input', () => {
    const { errors, warnings } = parseLatexLog(fixture('latexonline-missing-file'))
    expect(errors.map((e) => [e.message, e.line])).toEqual([
      ["[pdftex.def] File `missing-photo.png' not found", 5],
      ["File `chapter-two.tex' not found", 6],
    ])
    expect(warnings[0]).toMatchObject({ line: 5, message: "File `missing-photo.png' not found" })
  })

  it('overfull and underfull boxes are typesetting warnings with a line', () => {
    const parsed = parseLatexLog(fixture('latexonline-overfull-hbox'))
    expect(parsed.typesetting.map((e) => [e.message, e.line])).toEqual([
      ['Underfull \\hbox (badness 10000) (page 1)', 3],
      ['Overfull \\hbox (224.05511pt too wide) (page 1)', 3],
    ])
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0]).toMatchObject({ message: 'Undefined control sequence', line: 6 })
  })

  it('package errors keep the package file and its line apart from main.tex', () => {
    const { errors } = parseLatexLog(fixture('latexonline-package-error'))
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatchObject({
      message: '[keyval] notanoption undefined',
      line: 994,
    })
    expect(errors[0]!.file).toMatch(/geometry\.sty$/)
    expect(isMainFile(errors[0]!.file)).toBe(false)
    expect(errors[1]).toMatchObject({
      message: "[xcolor] Undefined color `nosuchcolor'",
      file: 'main.tex',
      line: 5,
    })
  })

  it('missing package: error in main.tex at the line of \\begin{document}', () => {
    const { errors } = parseLatexLog(fixture('latexonline-missing-package'))
    expect(errors[0]).toMatchObject({
      message: "File `doesnotexistpkg.sty' not found",
      file: 'main.tex',
      line: 3,
    })
  })
})

describe('parseLatexLog — raw pdflatex format', () => {
  it('undefined control sequence: `!` + l.<n> inside ./main.tex', () => {
    const { errors } = parseLatexLog(fixture('pdflatex-undefined-control-sequence'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      severity: 'error',
      message: 'Undefined control sequence.',
      file: 'main.tex',
      line: 5,
    })
    expect(errors[0]!.context).toContain('This line has \\foobarbaz')
  })

  it('missing brace: runaway argument without a line number', () => {
    const { errors } = parseLatexLog(fixture('pdflatex-missing-brace'))
    expect(errors[0]).toMatchObject({
      message: 'File ended while scanning use of \\textbf .',
      file: 'main.tex',
      line: null,
    })
    expect(errors[1]!.message).toBe('Emergency stop.')
  })

  it('missing file: rejoins the wrapped package error and reads both lines', () => {
    const parsed = parseLatexLog(fixture('pdflatex-missing-file'))
    expect(parsed.errors.map((e) => [e.message, e.line])).toEqual([
      ["Package pdftex.def Error: File `missing-photo.png' not found: using draft setting.", 5],
      // The line comes from the emergency stop that the missing \input causes.
      ["File `chapter-two.tex' not found.", 6],
      ['Emergency stop.', 6],
    ])
    expect(parsed.errors.every((e) => e.file === 'main.tex')).toBe(true)
    expect(parsed.warnings[0]).toMatchObject({
      message: "File `missing-photo.png' not found on input line 5.",
      line: 5,
    })
  })

  it('overfull/underfull boxes and LaTeX/package warnings', () => {
    const parsed = parseLatexLog(fixture('pdflatex-overfull-hbox'))
    expect(parsed.errors).toHaveLength(0)
    expect(parsed.typesetting.map((e) => [e.message, e.line])).toEqual([
      ['Underfull \\hbox (badness 10000) in paragraph at lines 3--4', 3],
      ['Overfull \\hbox (224.05511pt too wide) in paragraph at lines 3--4', 3],
      ['Overfull \\hbox (38.4291pt too wide) in paragraph at lines 5--6', 5],
    ])
    expect(parsed.warnings.map((e) => [e.message, e.line])).toEqual([
      ["Reference `sec:results' on page 1 undefined on input line 8.", 8],
      [
        "Citation `knuth1984texbook-with-a-long-key-name' on page 1 undefined on input line 9.",
        9,
      ],
      [
        "Package hyperref Warning: Token not allowed in a PDF string (Unicode): removing `math shift' on input line 10.",
        10,
      ],
      ['There were undefined references.', null],
    ])
    expect(parsed.typesetting.every((e) => e.file === 'main.tex')).toBe(true)
  })

  it('package errors: file stack attributes the keyval error to geometry.sty', () => {
    const { errors } = parseLatexLog(fixture('pdflatex-package-error'))
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatchObject({
      message: 'Package keyval Error: notanoption undefined.',
      line: 994,
    })
    expect(errors[0]!.file).toMatch(/geometry\.sty$/)
    expect(errors[1]).toMatchObject({
      message: "Package xcolor Error: Undefined color `nosuchcolor'.",
      file: 'main.tex',
      line: 5,
    })
  })

  it('-file-line-error style lines are read as errors', () => {
    const { errors } = parseLatexLog('./main.tex:12: Undefined control sequence.\nl.12 \\foo\n')
    expect(errors[0]).toMatchObject({ file: 'main.tex', line: 12, message: 'Undefined control sequence.' })
  })
})

describe('parseLatexLog — edge cases', () => {
  it('returns empty lists for an empty or unrelated log', () => {
    expect(parseLatexLog('').all).toEqual([])
    expect(parseLatexLog('Compile service unreachable: fetch failed').all).toEqual([])
  })

  it('all lists entries in log order', () => {
    const parsed = parseLatexLog(fixture('latexonline-overfull-hbox'))
    expect(parsed.all.map((e) => e.severity)).toEqual(['typesetting', 'typesetting', 'error'])
  })
})

describe('isMainFile', () => {
  it('treats main.tex paths and unknown files as the editor file', () => {
    expect(isMainFile('main.tex')).toBe(true)
    expect(isMainFile(null)).toBe(true)
    expect(isMainFile('/usr/share/texlive/texmf-dist/tex/latex/geometry/geometry.sty')).toBe(false)
  })
})
