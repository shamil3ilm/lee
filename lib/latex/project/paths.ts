// Project file paths, shared by the browser (zip import, export, asset URLs)
// and the server (asset storage, the compile tarball). Client-safe: no node
// imports.
//
// A document asset is named by a relative path: a plain file name
// ('photo.jpg') or folders and a name ('figures/logo.png'). Both compile
// services take folders (verified 2026-10-08, see docs/latex-compile.md), and
// LaTeX resolves `\input{sections/intro}` from the working directory, so a
// project keeps its folder layout.

/** Longest stored path. ustar's name field is 100 bytes, and Drive keeps the path in a 124-byte appProperty. */
export const MAX_ASSET_PATH_CHARS = 100
/** Deepest folder nesting kept (segments, the file name included). */
export const MAX_PATH_DEPTH = 8

/** A segment as it may appear in a stored path or a compile archive. */
const SEGMENT = /^[A-Za-z0-9._ -]+$/

/**
 * Normalise one file name to something safe to embed in a LaTeX source and
 * to store on a compile server's filesystem: drops any directory prefix,
 * collapses `..` runs and whitespace, and replaces anything else unusual
 * with `_`. Preserves the extension.
 */
export function sanitizeSegment(input: string): string {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return ''
  const noPath = trimmed.split(/[\\/]/).pop() ?? ''
  const noTraversal = noPath.replace(/\.\.+/g, '.')
  const collapsed = noTraversal.replace(/\s+/g, '_')
  const safe = collapsed.replace(/[^A-Za-z0-9._-]/g, '_')
  return safe.replace(/_{2,}/g, '_').slice(0, 200)
}

function isDotSegment(s: string): boolean {
  return s === '.' || s === '..'
}

/**
 * The stored form of a caller-supplied asset name. A plain name keeps the
 * old behaviour (directory prefix dropped). A clean relative path keeps its
 * folders, each segment sanitised. Anything suspicious (absolute, a
 * backslash, `.`/`..` or empty segments, too deep or too long) falls back to
 * the sanitised base name, so a stored name can never climb out of the
 * project.
 */
export function sanitizeAssetPath(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw.includes('/')) return sanitizeSegment(raw)
  const fallback = sanitizeSegment(raw)
  if (raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return fallback
  const segments = raw.split('/').map((s) => s.trim())
  if (segments.some((s) => s === '' || isDotSegment(s))) return fallback
  const clean = segments.map(sanitizeSegment)
  if (clean.some((s) => s === '' || isDotSegment(s))) return fallback
  const joined = clean.join('/')
  if (clean.length > MAX_PATH_DEPTH || joined.length > MAX_ASSET_PATH_CHARS) return fallback
  return joined
}

/**
 * True for a relative path a compile archive may carry: 1–8 segments of
 * letters, digits, `.`, `_`, `-` or spaces, no `.`/`..` segment, at most
 * 100 bytes.
 */
export function isSafeProjectPath(path: string): boolean {
  if (!path || new TextEncoder().encode(path).length > MAX_ASSET_PATH_CHARS) return false
  const segments = path.split('/')
  if (segments.length > MAX_PATH_DEPTH) return false
  return segments.every((s) => SEGMENT.test(s) && !isDotSegment(s))
}

/** The folder part of a path ('' at the root). */
export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** The file name part of a path. */
export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The authenticated URL of a document asset (each segment encoded). */
export function assetUrl(documentId: string, path: string): string {
  return `/api/documents/${documentId}/assets/${path.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Resolve `ref` against `fromDir` the way a POSIX shell would ('a/./b',
 * 'a/../b'). Null when it climbs above the root or is absolute.
 */
export function joinRelative(fromDir: string, ref: string): string | null {
  if (ref.startsWith('/') || /^[A-Za-z]:/.test(ref)) return null
  const out: string[] = fromDir ? fromDir.split('/') : []
  for (const seg of ref.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.join('/')
}
