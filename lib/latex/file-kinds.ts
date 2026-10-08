// File kinds in a LaTeX project: main.tex is the document's source, every
// other file is a document asset bundled next to it (at its folder path) at
// compile time.

export type ProjectFileKind = 'tex' | 'bib' | 'sty' | 'cls' | 'text' | 'image' | 'pdf' | 'other'

export const MAIN_FILE = 'main.tex'

const EXT_KIND: Readonly<Record<string, ProjectFileKind>> = {
  tex: 'tex',
  bib: 'bib',
  sty: 'sty',
  cls: 'cls',
  // Package-like files (bibliography styles, biblatex styles, font and
  // class option files) open as text like a .sty.
  bst: 'sty',
  bbx: 'sty',
  cbx: 'sty',
  def: 'sty',
  cfg: 'sty',
  clo: 'sty',
  fd: 'sty',
  txt: 'text',
  md: 'text',
  csv: 'text',
  dat: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  eps: 'image',
  pdf: 'pdf',
}

export function fileExtension(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename)
  return m ? m[1]!.toLowerCase() : ''
}

export function fileKind(filename: string): ProjectFileKind {
  return EXT_KIND[fileExtension(filename)] ?? 'other'
}

/** Files the editor can open as text in a tab. */
export function isTextFile(filename: string): boolean {
  const kind = fileKind(filename)
  return kind === 'tex' || kind === 'bib' || kind === 'sty' || kind === 'cls' || kind === 'text'
}

/** `accept` for the Import / Upload file pickers. */
export const IMPORT_ACCEPT = '.tex,.bib,.cls,.sty,.png,.jpg,.jpeg,.gif,.pdf,.eps,image/*,application/pdf'

/** MIME type to upload a text file with (browsers often leave it empty). */
export function mimeForFile(filename: string, browserType: string): string {
  if (browserType) return browserType
  const kind = fileKind(filename)
  if (kind === 'bib') return 'text/x-bibtex'
  if (kind === 'tex' || kind === 'sty' || kind === 'cls') return 'text/x-tex'
  if (kind === 'text') return 'text/plain'
  return 'application/octet-stream'
}

const NEW_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,90}\.(tex|bib|sty|cls)$/

/** A valid name for a new text file, or an error message. */
export function validateNewFileName(name: string, existing: readonly string[]): string | null {
  const n = name.trim()
  if (!NEW_FILE_NAME.test(n)) return 'Use letters, digits, dots or dashes, ending in .tex, .bib, .sty or .cls.'
  if (n === MAIN_FILE || existing.includes(n)) return `${n} already exists.`
  return null
}
