import { describe, expect, it } from 'vitest'
import { escapeLatex } from '@/lib/latex/escape'
import { escapeLatex as reExported } from '@/lib/latex/templates'

describe('escapeLatex', () => {
  it('escapes every LaTeX special character', () => {
    expect(escapeLatex('& % $ # _ { } ~ ^ \\ < >')).toBe(
      '\\& \\% \\$ \\# \\_ \\{ \\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{} \\textless{} \\textgreater{}',
    )
  })

  it('never escapes the braces an escape introduces', () => {
    expect(escapeLatex('a\\b')).toBe('a\\textbackslash{}b')
    expect(escapeLatex('~^')).toBe('\\textasciitilde{}\\textasciicircum{}')
  })

  it('leaves ordinary text alone, including "BS" (a former sentinel bug)', () => {
    expect(escapeLatex('BSc Computer Science, MBS, BSD')).toBe('BSc Computer Science, MBS, BSD')
    expect(escapeLatex('Café — 2021 – Present')).toBe('Café — 2021 – Present')
  })

  it('is the function the templates module re-exports', () => {
    expect(reExported).toBe(escapeLatex)
  })
})
