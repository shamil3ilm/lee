import { describe, it, expect } from 'vitest'
import { extractOutline, sectionFoldRange } from '@/lib/latex/outline'

const DOC = [
  '\\documentclass{article}', // 1
  '\\begin{document}', // 2
  '\\section{Intro}', // 3
  'Text.', // 4
  '% \\section{Hidden}', // 5
  '\\subsection*{Background \\& \\emph{motivation}}', // 6
  'More.', // 7
  '\\section[Short]{Results}\\label{sec:r}', // 8
  'Body.', // 9
  '\\paragraph{Note} inline text', // 10
  '\\end{document}', // 11
  '',
].join('\n')

describe('extractOutline', () => {
  it('lists headings with level, title, line and offset', () => {
    const outline = extractOutline(DOC)
    expect(outline.map((o) => [o.command, o.level, o.title, o.line, o.starred])).toEqual([
      ['section', 2, 'Intro', 3, false],
      ['subsection', 3, 'Background \\& \\emph{motivation}', 6, true],
      ['section', 2, 'Results', 8, false],
      ['paragraph', 5, 'Note', 10, false],
    ])
    expect(DOC.slice(outline[0]!.from, outline[0]!.from + 8)).toBe('\\section')
  })

  it('returns nothing for a document without headings', () => {
    expect(extractOutline('Just text\n\\textbf{x}')).toEqual([])
  })

  it('knows part and chapter', () => {
    const outline = extractOutline('\\part{A}\n\\chapter{B}\n\\subsubsection{C}')
    expect(outline.map((o) => o.level)).toEqual([0, 1, 4])
  })
})

describe('sectionFoldRange', () => {
  const lineStart = (n: number) => DOC.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0)
  const lineEnd = (n: number) => lineStart(n) + DOC.split('\n')[n - 1]!.length

  it('folds a section up to the next heading of the same or higher level', () => {
    const range = sectionFoldRange(DOC, lineStart(3))
    expect(range).toEqual({ from: lineEnd(3), to: lineEnd(7) })
  })

  it('folds a subsection up to the next section', () => {
    expect(sectionFoldRange(DOC, lineStart(6))).toEqual({ from: lineEnd(6), to: lineEnd(7) })
  })

  it('folds the last section up to \\end{document}', () => {
    expect(sectionFoldRange(DOC, lineStart(8))).toEqual({ from: lineEnd(8), to: lineEnd(10) })
  })

  it('returns null for a line that is not a heading, or an empty section', () => {
    expect(sectionFoldRange(DOC, lineStart(4))).toBeNull()
    expect(sectionFoldRange('\\section{A}\n\\section{B}', 0)).toBeNull()
  })
})
