// ---------------------------------------------------------------------------
// Detect a local file path pasted where LaTeX was expected, e.g. a user
// pasting "C:\Users\me\resume.tex" into main.tex meaning "load this file".
// Browsers can't read local paths, so the editor offers Import instead of
// compiling (TeX would report \Users, \me … as undefined commands).
// ---------------------------------------------------------------------------

const MAX_PATH_CHARS = 400
const WINDOWS_PATH = /^[A-Za-z]:[\\/](?:[^<>:"|?*\r\n]+[\\/]?)*$/
const UNC_PATH = /^\\\\[^\\/\s]+[\\/][^\r\n]*$/
const POSIX_PATH = /^(?:~|\.{1,2})?\/[^\r\n]*\.(?:tex|bib|cls|sty|png|jpe?g|pdf)$/i
const FILE_URL = /^file:\/\/\S+$/i
const LATEX_MARKERS = /\\(?:documentclass|begin|section|usepackage|input|include)\b/

function unquote(line: string): string {
  const t = line.trim()
  const m = /^(["'])(.*)\1$/.exec(t)
  return (m ? m[2]! : t).trim()
}

function isPathLine(line: string): boolean {
  const t = unquote(line)
  if (!t || t.length > MAX_PATH_CHARS) return false
  return WINDOWS_PATH.test(t) || UNC_PATH.test(t) || POSIX_PATH.test(t) || FILE_URL.test(t)
}

/**
 * True when the whole text is one or more local file paths (quoted or not)
 * and nothing that looks like LaTeX.
 */
export function looksLikeFilePath(text: string): boolean {
  const trimmed = (text ?? '').trim()
  if (!trimmed || trimmed.length > MAX_PATH_CHARS * 3 || LATEX_MARKERS.test(trimmed)) return false
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim())
  return lines.length > 0 && lines.length <= 3 && lines.every(isPathLine)
}

/** The file name at the end of a pasted path ("resume.tex"), or null. */
export function pathFileName(text: string): string | null {
  const first = (text ?? '').trim().split(/\r?\n/)[0]
  if (!first) return null
  const name = unquote(first).split(/[\\/]/).pop()
  return name ? name : null
}
