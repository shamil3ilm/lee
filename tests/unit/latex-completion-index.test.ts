import { describe, it, expect } from 'vitest'
import {
  buildCompletionIndex,
  completionContextAt,
  extractBibKeys,
  innermostOpenEnvironment,
  maskComments,
} from '@/lib/latex/completion-index'
import {
  COMMANDS,
  ENVIRONMENTS,
  environmentTailTemplate,
  environmentTemplate,
} from '@/lib/latex/vocabulary'

const DOC = String.raw`\documentclass{article}
\usepackage{graphicx}
\newcommand{\R}{\mathbb{R}}
\newcommand\norm[1]{\left\lVert#1\right\rVert}
\renewcommand{\vec}[2][x]{#1_#2}
\providecommand{\email}[1]{\texttt{#1}}
\DeclareMathOperator{\argmax}{arg\,max}
\def\half{\frac12}
\newenvironment{note}{\begin{quote}}{\end{quote}}
% \newcommand{\commented}{no}
\begin{document}
\section{Intro}\label{sec:intro}
See \ref{sec:intro} and \label{eq:main} % \label{eq:hidden}
\label{sec:intro}
\end{document}
`

describe('maskComments', () => {
  it('blanks comments but keeps offsets and escaped percent signs', () => {
    const src = 'a % b\n50\\% c % d'
    const masked = maskComments(src)
    expect(masked).toHaveLength(src.length)
    expect(masked).toBe('a    \n50\\% c    ')
  })
})

describe('buildCompletionIndex', () => {
  const index = buildCompletionIndex({
    source: DOC,
    bibSources: ['@article{knuth84, title={TeX}}\n@book{lamport94,\n title={LaTeX}}'],
    assetFilenames: ['photo.png', 'logo.PDF', 'chapter.tex', 'refs.bib', 'notes.txt'],
  })

  it('finds user-defined commands with their argument counts', () => {
    expect(index.commands).toEqual([
      { name: 'R', args: 0 },
      { name: 'norm', args: 1 },
      { name: 'vec', args: 1 },
      { name: 'email', args: 1 },
      { name: 'argmax', args: 0 },
      { name: 'half', args: 0 },
    ])
  })

  it('finds user-defined environments', () => {
    expect(index.environments).toEqual(['note'])
  })

  it('lists each label once, ignoring commented-out labels', () => {
    expect(index.labels).toEqual(['sec:intro', 'eq:main'])
  })

  it('reads cite keys from every .bib source', () => {
    expect(index.citeKeys).toEqual(['knuth84', 'lamport94'])
  })

  it('splits asset files into graphics and inputs', () => {
    expect(index.graphicsFiles).toEqual(['photo.png', 'logo.PDF'])
    expect(index.inputFiles).toEqual(['chapter.tex', 'refs.bib', 'notes.txt'])
  })

  it('handles an empty document', () => {
    expect(buildCompletionIndex({ source: '' })).toEqual({
      commands: [],
      environments: [],
      labels: [],
      citeKeys: [],
      graphicsFiles: [],
      inputFiles: [],
    })
  })
})

describe('extractBibKeys', () => {
  it('skips @string, @comment and @preamble blocks', () => {
    const bib = '@string{acm = "ACM"}\n@comment{x}\n@preamble{"y"}\n@InProceedings{ doe:2020 ,\n}'
    expect(extractBibKeys(bib)).toEqual(['doe:2020'])
  })
})

describe('completionContextAt', () => {
  it('command after a backslash', () => {
    expect(completionContextAt('Hello \\sec', 10)).toEqual({ kind: 'command', from: 6, prefix: 'sec' })
    expect(completionContextAt('\\', 1)).toEqual({ kind: 'command', from: 0, prefix: '' })
  })

  it('environment names inside \\begin{ and \\end{', () => {
    expect(completionContextAt('\\begin{ite', 10)).toEqual({ kind: 'environment', from: 7, prefix: 'ite' })
    expect(completionContextAt('\\end{', 5)).toEqual({ kind: 'end-environment', from: 5, prefix: '' })
  })

  it('labels for \\ref, \\eqref, \\autoref and \\pageref', () => {
    expect(completionContextAt('see \\ref{sec:', 13)).toEqual({ kind: 'ref', from: 9, prefix: 'sec:' })
    expect(completionContextAt('\\eqref{', 7)).toMatchObject({ kind: 'ref', prefix: '' })
    expect(completionContextAt('\\autoref{x', 10)).toMatchObject({ kind: 'ref', prefix: 'x' })
  })

  it('cite keys, including after a comma and an optional argument', () => {
    expect(completionContextAt('\\cite{knu', 9)).toEqual({ kind: 'cite', from: 6, prefix: 'knu' })
    expect(completionContextAt('\\citep[p.~2]{a, la', 18)).toEqual({ kind: 'cite', from: 16, prefix: 'la' })
  })

  it('files for \\includegraphics (with options) and \\input/\\include', () => {
    expect(completionContextAt('\\includegraphics[width=3cm]{ph', 30)).toEqual({
      kind: 'graphics',
      from: 28,
      prefix: 'ph',
    })
    expect(completionContextAt('\\input{ch', 9)).toEqual({ kind: 'input', from: 7, prefix: 'ch' })
    expect(completionContextAt('\\include{', 9)).toMatchObject({ kind: 'input', prefix: '' })
  })

  it('nothing in plain text, after a closed brace, or in a comment', () => {
    expect(completionContextAt('plain text', 10)).toBeNull()
    expect(completionContextAt('\\ref{a} more', 12)).toBeNull()
    expect(completionContextAt('% \\sec', 6)).toBeNull()
    expect(completionContextAt('\\\\', 2)).toBeNull()
  })
})

describe('innermostOpenEnvironment', () => {
  it('returns the environment an \\end{ should close', () => {
    const text = '\\begin{document}\n\\begin{itemize}\n\\begin{center}x\\end{center}\n\\item a\n'
    expect(innermostOpenEnvironment(text)).toBe('itemize')
    expect(innermostOpenEnvironment('\\begin{a}\\end{a}')).toBeNull()
    expect(innermostOpenEnvironment('% \\begin{hidden}\n')).toBeNull()
  })
})

describe('vocabulary templates', () => {
  it('every command template starts with its command', () => {
    for (const c of COMMANDS) {
      if (c.template) expect(c.template.startsWith(`\\${c.name}`)).toBe(true)
    }
  })

  it('environment templates close what they open', () => {
    for (const env of ENVIRONMENTS) {
      const t = environmentTemplate(env)
      expect(t.startsWith(`\\begin{${env.name}}`)).toBe(true)
      expect(t.endsWith(`\\end{${env.name}}`)).toBe(true)
      expect(environmentTailTemplate(env).startsWith(`${env.name}}`)).toBe(true)
    }
  })
})
