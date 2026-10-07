const LATEX_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
}

/**
 * Escape a plain-text string so LaTeX renders it as literal text — no macros
 * or math triggered. One pass over the input, so the braces an escape
 * introduces are never escaped again, and ordinary text (e.g. "BSc") is
 * never mistaken for a placeholder.
 */
export function escapeLatex(input: string): string {
  return input.replace(/[\\&%$#_{}~^<>]/g, (c) => LATEX_ESCAPES[c]!)
}
