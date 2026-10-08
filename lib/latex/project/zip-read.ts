// Read a LaTeX project .zip in the browser (fflate, lazy-loaded with the
// import UI). Every guard runs on the central directory BEFORE anything is
// inflated: the declared sizes bound what fflate allocates (it inflates
// into a buffer of the declared size and never grows it), so a lying or
// hostile archive cannot use more memory than the caps allow.

import { unzipSync, type UnzipFileInfo } from 'fflate'
import { fileExtension } from '../file-kinds'
import { basename } from './paths'
import { importKind, type ImportFileKind } from './file-types'
import {
  MAX_COMPRESSION_RATIO,
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_FILE_BYTES,
  MAX_ZIP_TOTAL_BYTES,
  RATIO_CHECK_MIN_BYTES,
} from './limits'
import { formatBytes } from './format'

export type ZipErrorCode = 'zip_too_large' | 'too_many_entries' | 'too_large' | 'zip_bomb' | 'unsafe_path' | 'invalid_zip' | 'empty'

export class ZipImportError extends Error {
  readonly code: ZipErrorCode
  constructor(code: ZipErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ZipImportError'
  }
}

export interface ZipFile {
  /** Normalised relative path inside the project. */
  path: string
  bytes: Uint8Array
  kind: ImportFileKind
}

export interface SkippedEntry {
  path: string
  reason: string
}

export interface ZipScan {
  files: ZipFile[]
  skipped: SkippedEntry[]
  /** Text of latexmkrc / .latexmkrc (read for the compiler, never stored). */
  latexmkrc: string | null
  /** A single top-level folder every file sat in, removed from the paths. */
  strippedFolder: string | null
  /** Declared uncompressed bytes of the files read. */
  totalBytes: number
}

type Normalised = { kind: 'file'; path: string } | { kind: 'dir' } | { kind: 'unsafe' }

/**
 * Normalise a zip entry name: `\` → `/`, `.` and empty segments dropped.
 * Absolute names and `..` segments are unsafe (zip-slip).
 */
export function normalizeZipPath(raw: string): Normalised {
  const name = raw.replace(/\\/g, '/')
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return { kind: 'unsafe' }
  if (name.endsWith('/')) return { kind: 'dir' }
  const segments = name.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.includes('..')) return { kind: 'unsafe' }
  if (segments.length === 0) return { kind: 'dir' }
  return { kind: 'file', path: segments.join('/') }
}

const SYSTEM_FILES = new Map([
  ['.DS_Store', 'macOS folder metadata'],
  ['Thumbs.db', 'Windows thumbnail cache'],
  ['desktop.ini', 'Windows folder settings'],
])
const LATEXMKRC = new Set(['latexmkrc', '.latexmkrc'])

/** Why a (safe, normalised) path is not imported, or null to read it. */
export function skipReason(path: string): string | null {
  const segments = path.split('/')
  const name = segments[segments.length - 1]!
  if (segments.includes('__MACOSX')) return 'macOS resource fork (__MACOSX)'
  const system = SYSTEM_FILES.get(name)
  if (system) return system
  if (LATEXMKRC.has(name)) return 'Read for the compiler setting; not stored'
  if (segments.some((s) => s.startsWith('.'))) return 'Hidden file'
  if (importKind(path) === null) {
    const ext = fileExtension(name)
    return ext ? `Unsupported file type (.${ext})` : 'Unsupported file type (no extension)'
  }
  return null
}

interface Accepted {
  raw: string
  path: string
}

function guardEntry(file: UnzipFileInfo): void {
  if (file.originalSize >= RATIO_CHECK_MIN_BYTES && file.originalSize / Math.max(file.size, 1) > MAX_COMPRESSION_RATIO) {
    throw new ZipImportError(
      'zip_bomb',
      `${file.name} expands ${Math.round(file.originalSize / Math.max(file.size, 1))}× (${formatBytes(file.originalSize)}). ` +
        'That looks like a zip bomb, so the archive was not opened.',
    )
  }
}

/** Remove one top-level folder that every kept path shares (GitHub-style zips). */
function commonFolder(paths: readonly string[]): string | null {
  if (paths.length === 0) return null
  const first = paths[0]!.split('/')[0]!
  const shared = paths.every((p) => p.includes('/') && p.split('/')[0] === first)
  return shared ? first : null
}

/**
 * Validate and read a project zip. Throws ZipImportError for an archive that
 * must not be imported at all (too big, too many entries, a zip bomb, an
 * unsafe path, not a zip); files that are merely not imported come back in
 * `skipped` with the reason.
 */
export function readZipProject(zip: Uint8Array): ZipScan {
  if (zip.byteLength > MAX_ZIP_BYTES) {
    throw new ZipImportError('zip_too_large', `The zip is ${formatBytes(zip.byteLength)}; the limit is ${formatBytes(MAX_ZIP_BYTES)}.`)
  }
  const skipped: SkippedEntry[] = []
  const accepted: Accepted[] = []
  const seen = new Set<string>()
  let entries = 0
  let total = 0
  let latexmkrcRaw: { raw: string; path: string } | null = null

  const filter = (file: UnzipFileInfo): boolean => {
    entries += 1
    if (entries > MAX_ZIP_ENTRIES) {
      throw new ZipImportError('too_many_entries', `The zip has more than ${MAX_ZIP_ENTRIES} entries.`)
    }
    const n = normalizeZipPath(file.name)
    if (n.kind === 'unsafe') {
      throw new ZipImportError('unsafe_path', `The zip contains an unsafe path (${file.name}), so it was not opened.`)
    }
    if (n.kind === 'dir') return false
    const reason = skipReason(n.path)
    const isRc = LATEXMKRC.has(basename(n.path)) && !n.path.split('/').includes('__MACOSX')
    if (reason && !isRc) {
      skipped.push({ path: n.path, reason })
      return false
    }
    if (seen.has(n.path)) {
      skipped.push({ path: n.path, reason: 'Duplicate entry in the zip' })
      return false
    }
    if (file.originalSize > MAX_ZIP_FILE_BYTES) {
      skipped.push({ path: n.path, reason: `Larger than ${formatBytes(MAX_ZIP_FILE_BYTES)} (${formatBytes(file.originalSize)})` })
      return false
    }
    if (file.compression !== 0 && file.compression !== 8) {
      skipped.push({ path: n.path, reason: 'Unsupported compression method' })
      return false
    }
    guardEntry(file)
    total += file.originalSize
    if (total > MAX_ZIP_TOTAL_BYTES) {
      throw new ZipImportError('too_large', `The project expands to more than ${formatBytes(MAX_ZIP_TOTAL_BYTES)}.`)
    }
    seen.add(n.path)
    if (isRc) {
      // Keep the shallowest one; never stored, only read.
      if (!latexmkrcRaw || n.path.split('/').length < latexmkrcRaw.path.split('/').length) latexmkrcRaw = { raw: file.name, path: n.path }
      skipped.push({ path: n.path, reason: reason ?? 'Read for the compiler setting; not stored' })
      return true
    }
    accepted.push({ raw: file.name, path: n.path })
    return true
  }

  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(zip, { filter })
  } catch (err) {
    if (err instanceof ZipImportError) throw err
    throw new ZipImportError('invalid_zip', "This file isn't a readable .zip archive.")
  }

  const folder = commonFolder(accepted.map((a) => a.path))
  const strip = (p: string) => (folder && p.startsWith(`${folder}/`) ? p.slice(folder.length + 1) : p)
  const files: ZipFile[] = accepted.map((a) => ({
    path: strip(a.path),
    bytes: unzipped[a.raw] ?? new Uint8Array(0),
    kind: importKind(a.path)!,
  }))
  if (files.length === 0) {
    throw new ZipImportError('empty', 'The zip has no LaTeX project files (.tex, .bib, images…).')
  }
  const rc = latexmkrcRaw as { raw: string; path: string } | null
  const latexmkrc = rc && unzipped[rc.raw] ? new TextDecoder().decode(unzipped[rc.raw]) : null
  return {
    files,
    skipped: skipped.map((s) => ({ ...s, path: strip(s.path) })),
    latexmkrc,
    strippedFolder: folder,
    totalBytes: total,
  }
}
