// Which files a .zip import keeps, and the MIME type each is stored with.
// Client-safe.

import { fileExtension } from '../file-kinds'

/** Text sources: decoded as UTF-8 for scanning; stored byte for byte unless a reference is rewritten. */
export const IMPORT_TEXT_EXTENSIONS = [
  'tex', 'bib', 'bst', 'cls', 'sty', 'bbx', 'cbx', 'def', 'cfg', 'clo', 'fd', 'txt', 'md', 'csv', 'dat',
] as const

/** Binary files: images, fonts. */
export const IMPORT_BINARY_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg', 'otf', 'ttf'] as const

const TEXT = new Set<string>(IMPORT_TEXT_EXTENSIONS)
const BINARY = new Set<string>(IMPORT_BINARY_EXTENSIONS)

export type ImportFileKind = 'text' | 'binary'

/** 'text', 'binary', or null when the type isn't imported. */
export function importKind(path: string): ImportFileKind | null {
  const ext = fileExtension(path)
  if (TEXT.has(ext)) return 'text'
  if (BINARY.has(ext)) return 'binary'
  return null
}

const MIME: Readonly<Record<string, string>> = {
  tex: 'text/x-tex',
  sty: 'text/x-tex',
  cls: 'text/x-tex',
  bbx: 'text/x-tex',
  cbx: 'text/x-tex',
  def: 'text/x-tex',
  cfg: 'text/x-tex',
  clo: 'text/x-tex',
  fd: 'text/x-tex',
  bib: 'text/x-bibtex',
  bst: 'text/plain',
  txt: 'text/plain',
  dat: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  eps: 'application/postscript',
  svg: 'image/svg+xml',
  otf: 'font/otf',
  ttf: 'font/ttf',
}

export function mimeForPath(path: string): string {
  return MIME[fileExtension(path)] ?? 'application/octet-stream'
}

/** `accept` for the "Import project (.zip)" pickers. */
export const ZIP_ACCEPT = '.zip,application/zip,application/x-zip-compressed'

export function isZipFile(file: Pick<File, 'name' | 'type'>): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
}
