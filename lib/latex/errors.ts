// ---------------------------------------------------------------------------
// Parse a latexonline.cc / pdflatex log fragment for well-known error shapes
// and surface a one-line suggested action. The output is UI-facing copy —
// the raw log is still shown for context, but a hint makes the fix a single
// action away (usually "add \usepackage{...}" or "upload the missing asset").
// ---------------------------------------------------------------------------

export interface LatexHint {
  /** Human-readable suggestion shown next to the raw log. */
  message: string
  /** Machine-readable tag for automation (tests, future auto-fix). */
  kind:
    | 'missing_package'
    | 'missing_asset'
    | 'undefined_command'
    | 'missing_font'
    | 'unclosed_environment'
}

interface HintPattern {
  pattern: RegExp
  toHint: (match: RegExpMatchArray) => LatexHint
}

const HINT_PATTERNS: HintPattern[] = [
  {
    // "! LaTeX Error: File `pdfpages.sty' not found."
    // "! LaTeX Error: File `graphicx.sty' not found."
    pattern: /File `([\w-]+)\.sty' not found/,
    toHint: (m) => ({
      kind: 'missing_package',
      message: `Add \\usepackage{${m[1]}} to your preamble.`,
    }),
  },
  {
    // "! LaTeX Error: File `foo.tex' not found." — non-.sty missing input.
    pattern: /File `([^']+)' not found/,
    toHint: (m) => ({
      kind: 'missing_asset',
      message: `Missing file "${m[1]}" — upload it via the Assets panel (or fix the filename).`,
    }),
  },
  {
    // "! Font T1/OpenSans/m/n/10.95=OpenSans-Regular not loadable"
    pattern: /Font [^ ]+=([\w-]+)[^ ]* not loadable/,
    toHint: (m) => ({
      kind: 'missing_font',
      message: `Font "${m[1]}" is not available on latexonline.cc. Consider swapping to a bundled font (e.g. Latin Modern).`,
    }),
  },
  {
    // "! Undefined control sequence.\nl.5 \foo"
    pattern: /Undefined control sequence[\s\S]{0,200}\\(\w+)/,
    toHint: (m) => ({
      kind: 'undefined_command',
      message: `\\${m[1]} is undefined — check the spelling or add the \\usepackage that defines it.`,
    }),
  },
  {
    // "! LaTeX Error: \begin{document} ended by \end{itemize}."
    pattern: /\\begin\{(\w+)\} ended by \\end\{(\w+)\}/,
    toHint: (m) => ({
      kind: 'unclosed_environment',
      message: `\\begin{${m[1]}} was closed by \\end{${m[2]}} — check for a mismatched or missing \\end.`,
    }),
  },
]

/**
 * Return the first matching hint for a compile log, or null when nothing
 * useful is recognised. Callers should still show the raw log — the hint is
 * additive, not a replacement.
 */
export function extractLatexHint(log: string): LatexHint | null {
  if (!log) return null
  for (const { pattern, toHint } of HINT_PATTERNS) {
    const m = log.match(pattern)
    if (m) return toHint(m)
  }
  return null
}
