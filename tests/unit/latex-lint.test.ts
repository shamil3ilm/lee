import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { lintLatex, type LintIssue } from '@/lib/latex/lint'

const doc = (body: string, preamble = '') =>
  `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`

function messages(issues: readonly LintIssue[]): string[] {
  return issues.map((i) => i.message)
}

describe('lintLatex — clean input', () => {
  it('accepts a well-formed document', () => {
    const src = doc(
      [
        '\\section{Intro} Price: 50\\% and \\{set\\}.',
        '\\begin{itemize}\\item a\\end{itemize}',
        'Inline $\\alpha + \\frac{1}{2}$ and \\(x^2\\) and \\[\\sum_i x_i\\] and $$\\int f$$.',
        '\\begin{equation}\\left( \\frac{a}{b} \\right) \\label{eq}\\end{equation}',
        '\\begin{align*} a &= \\sqrt{b} \\\\ c &\\le d \\end{align*}',
        '\\ensuremath{\\alpha} % $ unbalanced in a comment { is fine',
        '\\begin{verbatim}\\end{itemize} $ { \\frac\\end{verbatim}',
        '\\verb|$\\alpha{|',
      ].join('\n'),
      '\\newcommand{\\R}{\\mathbb{R}}\n\\def\\half{\\frac12}\n',
    )
    expect(lintLatex(src)).toEqual([])
  })
})

describe('lintLatex — environments', () => {
  it('flags a \\begin without \\end', () => {
    const src = doc('\\begin{itemize}\n\\item a')
    const issues = lintLatex(src)
    expect(messages(issues)).toContain('\\begin{itemize} is never closed.')
    const issue = issues.find((i) => i.message.startsWith('\\begin{itemize}'))!
    expect(src.slice(issue.from, issue.to)).toBe('\\begin{itemize}')
    expect(issue.severity).toBe('error')
  })

  it('flags a mismatched \\end', () => {
    const src = doc('\\begin{itemize}\n\\item a\n\\end{enumerate}')
    expect(messages(lintLatex(src))).toContain('\\end{enumerate} does not match \\begin{itemize}.')
  })

  it('flags an \\end without \\begin', () => {
    expect(messages(lintLatex(doc('text \\end{center}')))).toContain(
      '\\end{center} has no matching \\begin.',
    )
  })
})

describe('lintLatex — braces', () => {
  it('flags an unclosed brace at the opening brace', () => {
    const src = doc('\\textbf{bold never closed.')
    const issue = lintLatex(src).find((i) => i.message === 'Unclosed {.')!
    expect(src[issue.from]).toBe('{')
  })

  it('flags an extra closing brace', () => {
    const src = doc('text}')
    const issue = lintLatex(src).find((i) => i.message === 'Unexpected }.')!
    expect(src[issue.from]).toBe('}')
  })
})

describe('lintLatex — math', () => {
  it('flags an unclosed $', () => {
    expect(messages(lintLatex(doc('Cost $x + y.')))).toContain('Unclosed $ (inline math).')
  })

  it('flags an unclosed $$', () => {
    expect(messages(lintLatex(doc('$$ x + y')))).toContain('Unclosed $$ (display math).')
  })

  it('flags \\left without \\right and \\right without \\left', () => {
    expect(messages(lintLatex(doc('$\\left( x $')))).toContain('\\left has no matching \\right.')
    expect(messages(lintLatex(doc('$ x \\right) $')))).toContain('\\right has no matching \\left.')
  })

  it('flags math-only commands outside math mode as warnings', () => {
    const src = doc('The ratio \\frac{a}{b} and \\alpha here, x^2 is fine as text.')
    const issues = lintLatex(src).filter((i) => i.message.includes('outside math'))
    expect(messages(issues)).toEqual([
      '\\frac is only allowed in math mode (outside math here).',
      '\\alpha is only allowed in math mode (outside math here).',
    ])
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
    expect(src.slice(issues[0]!.from, issues[0]!.to)).toBe('\\frac')
  })

  it('treats \\text{...} inside math as text again', () => {
    expect(messages(lintLatex(doc('$a \\text{and \\alpha} b$')))).toContain(
      '\\alpha is only allowed in math mode (outside math here).',
    )
  })

  it('does not check preamble definitions', () => {
    expect(lintLatex(doc('x', '\\newcommand{\\half}{\\frac{1}{2}}\n'))).toEqual([])
  })
})

describe('lintLatex — bundled templates', () => {
  const dir = path.join(__dirname, '..', '..', 'lib', 'latex', 'templates')
  const files = readdirSync(dir).filter((f) => f.endsWith('.tex'))

  it('finds the templates', () => {
    expect(files.length).toBeGreaterThanOrEqual(14)
  })

  it.each(files)('%s passes Code Check without false positives', (file) => {
    expect(lintLatex(readFileSync(path.join(dir, file), 'utf8'))).toEqual([])
  })
})

describe('lintLatex — limits', () => {
  it('handles an empty source', () => {
    expect(lintLatex('')).toEqual([])
  })

  it('checks a fragment without \\begin{document}', () => {
    expect(messages(lintLatex('\\begin{itemize}'))).toEqual(['\\begin{itemize} is never closed.'])
  })
})
