import { describe, it, expect } from 'vitest'
import { extractLatexHint } from '@/lib/latex/errors'

describe('extractLatexHint', () => {
  it('returns null for empty logs', () => {
    expect(extractLatexHint('')).toBeNull()
    expect(extractLatexHint('everything compiled fine')).toBeNull()
  })

  it('detects a missing .sty package', () => {
    const log = "! LaTeX Error: File `pdfpages.sty' not found.\nType X to quit."
    const hint = extractLatexHint(log)
    expect(hint?.kind).toBe('missing_package')
    expect(hint?.message).toContain('\\usepackage{pdfpages}')
  })

  it('detects a missing asset file (non-.sty)', () => {
    const log = "! Package graphicx Error: File `photo.jpg' not found\nl.42 \\includegraphics{photo.jpg}"
    const hint = extractLatexHint(log)
    expect(hint?.kind).toBe('missing_asset')
    expect(hint?.message).toContain('photo.jpg')
    expect(hint?.message).toContain('Assets panel')
  })

  it('detects an undefined control sequence', () => {
    const log = '! Undefined control sequence.\nl.5 \\foobar'
    const hint = extractLatexHint(log)
    expect(hint?.kind).toBe('undefined_command')
    expect(hint?.message).toContain('\\foobar')
  })

  it('detects a mismatched environment', () => {
    const log = '! LaTeX Error: \\begin{itemize} ended by \\end{enumerate}.\n'
    const hint = extractLatexHint(log)
    expect(hint?.kind).toBe('unclosed_environment')
    expect(hint?.message).toContain('itemize')
    expect(hint?.message).toContain('enumerate')
  })

  it('detects an unloadable font', () => {
    const log = '! Font T1/OpenSans/m/n/10.95=OpenSans-Regular not loadable: metric (TFM) file not found.'
    const hint = extractLatexHint(log)
    expect(hint?.kind).toBe('missing_font')
    expect(hint?.message).toContain('OpenSans-Regular')
  })

  it('prefers the first matching pattern (missing sty over generic file)', () => {
    // `foo.sty' matches both the sty-specific and the generic file pattern.
    const log = "! LaTeX Error: File `foo.sty' not found."
    const hint = extractLatexHint(log)
    expect(hint?.kind).toBe('missing_package')
  })
})
