// Editor toolbar commands as pure text edits, so they are unit-testable and
// independent of CodeMirror. Each returns the change to apply and where the
// selection should land afterwards.

export interface TextEdit {
  from: number
  to: number
  insert: string
  /** Selection after the edit, as absolute offsets in the new document. */
  anchor: number
  head: number
}

export type ToolbarCommand =
  | 'bold'
  | 'italic'
  | 'section'
  | 'subsection'
  | 'itemize'
  | 'enumerate'
  | 'table'
  | 'figure'
  | 'link'
  | 'math'

function wrap(doc: string, from: number, to: number, before: string, after: string, placeholder: string): TextEdit {
  const selected = doc.slice(from, to)
  const body = selected || placeholder
  return {
    from,
    to,
    insert: `${before}${body}${after}`,
    anchor: from + before.length,
    head: from + before.length + body.length,
  }
}

/** Start a block on its own line: a newline first unless at a line start. */
function block(doc: string, from: number, to: number, text: string, cursorMarker: string): TextEdit {
  const atLineStart = from === 0 || doc[from - 1] === '\n'
  const lead = atLineStart ? '' : '\n'
  const selected = doc.slice(from, to)
  const filled = text.replace(cursorMarker, selected || cursorMarker)
  const insert = `${lead}${filled}`
  const at = insert.indexOf(cursorMarker)
  if (selected || at === -1) {
    const end = from + insert.length
    return { from, to, insert, anchor: end, head: end }
  }
  return {
    from,
    to,
    insert,
    anchor: from + at,
    head: from + at + cursorMarker.length,
  }
}

const ITEM = 'Item'

export function applyToolbarCommand(command: ToolbarCommand, doc: string, from: number, to: number): TextEdit {
  switch (command) {
    case 'bold':
      return wrap(doc, from, to, '\\textbf{', '}', 'bold text')
    case 'italic':
      return wrap(doc, from, to, '\\textit{', '}', 'italic text')
    case 'math':
      return wrap(doc, from, to, '$', '$', 'x^2')
    case 'link': {
      // A selected URL becomes both target and text; anything else is the text.
      const selected = doc.slice(from, to)
      if (/^https?:\/\/\S+$/.test(selected)) return wrap(doc, from, to, `\\href{${selected}}{`, '}', '')
      return wrap(doc, from, to, '\\href{https://}{', '}', 'link text')
    }
    case 'section':
      return block(doc, from, to, '\\section{Title}\n', 'Title')
    case 'subsection':
      return block(doc, from, to, '\\subsection{Title}\n', 'Title')
    case 'itemize':
      return block(doc, from, to, `\\begin{itemize}\n  \\item ${ITEM}\n\\end{itemize}\n`, ITEM)
    case 'enumerate':
      return block(doc, from, to, `\\begin{enumerate}\n  \\item ${ITEM}\n\\end{enumerate}\n`, ITEM)
    case 'table':
      return block(
        doc,
        from,
        to,
        '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{ll}\n    Cell & Cell \\\\\n    Cell & Cell \\\\\n  \\end{tabular}\n  \\caption{Caption}\n\\end{table}\n',
        'Caption',
      )
    case 'figure':
      return block(
        doc,
        from,
        to,
        '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.6\\linewidth]{image.png}\n  \\caption{Caption}\n\\end{figure}\n',
        'Caption',
      )
  }
}

/** Common symbols for the toolbar's symbol menu: label → LaTeX inserted. */
export const SYMBOLS: readonly { label: string; latex: string }[] = [
  { label: '–', latex: '--' },
  { label: '—', latex: '---' },
  { label: '•', latex: '\\textbullet{}' },
  { label: '·', latex: '\\textperiodcentered{}' },
  { label: '|', latex: '\\textbar{}' },
  { label: '&', latex: '\\&' },
  { label: '%', latex: '\\%' },
  { label: '$', latex: '\\$' },
  { label: '#', latex: '\\#' },
  { label: '_', latex: '\\_' },
  { label: '~', latex: '\\textasciitilde{}' },
  { label: '→', latex: '$\\rightarrow$' },
  { label: '×', latex: '$\\times$' },
  { label: '©', latex: '\\textcopyright{}' },
  { label: '€', latex: '\\texteuro{}' },
  { label: '£', latex: '\\pounds{}' },
]
