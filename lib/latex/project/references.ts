// Resolve a project's file references the way TeX would (from the project
// root, with \graphicspath and the default extensions), report the ones
// that point at nothing, and rewrite the ones whose target was renamed.

import { joinRelative, sanitizeSegment } from './paths'
import { scanTex, type GraphicsPathEntry, type TexRef } from './tex-scan'

const GRAPHIC_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.eps', '.PDF', '.PNG', '.JPG', '.JPEG', '.EPS']
const KNOWN_GRAPHIC_EXT = /\.(pdf|png|jpe?g|eps|svg)$/i

export interface ResolvedRef {
  /** The project file the reference resolves to. */
  file: string
  /** The \graphicspath prefix it was found under ('' for the root). */
  prefix: string
  /** The argument left the extension out (TeX added it). */
  extOmitted: boolean
}

interface Candidate {
  path: string
  prefix: string
  extOmitted: boolean
}

function unquote(arg: string): string {
  return arg.length >= 2 && arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg
}

/** The directory prefixes \graphicspath adds ('' first, as TeX tries the working directory first). */
export function graphicsPrefixes(entries: readonly GraphicsPathEntry[]): string[] {
  const out = ['']
  for (const e of entries) {
    const dir = joinRelative('', e.dir)
    if (dir !== null && dir !== '' && !out.includes(`${dir}/`)) out.push(`${dir}/`)
  }
  return out
}

function candidatesFor(ref: TexRef, prefixes: readonly string[]): Candidate[] {
  const arg = unquote(ref.arg)
  const plain = (path: string, extOmitted = false): Candidate => ({ path, prefix: '', extOmitted })
  switch (ref.command) {
    case 'input':
    case 'subfile':
      return /\.tex$/i.test(arg) ? [plain(arg)] : [plain(`${arg}.tex`, true), plain(arg)]
    case 'include':
      return [plain(`${arg}.tex`, true)]
    case 'bibliography':
      return /\.bib$/i.test(arg) ? [plain(arg)] : [plain(`${arg}.bib`, true)]
    case 'includepdf':
      return /\.pdf$/i.test(arg) ? [plain(arg)] : [plain(`${arg}.pdf`, true)]
    case 'includegraphics':
    case 'includesvg':
      return prefixes.flatMap((prefix): Candidate[] =>
        KNOWN_GRAPHIC_EXT.test(arg)
          ? [{ path: `${prefix}${arg}`, prefix, extOmitted: false }]
          : GRAPHIC_EXTS.map((ext) => ({ path: `${prefix}${arg}${ext}`, prefix, extOmitted: true })),
      )
    default:
      return [plain(arg)]
  }
}

/** The file a reference resolves to among `files`, or null. */
export function resolveRef(ref: TexRef, files: ReadonlySet<string>, prefixes: readonly string[]): ResolvedRef | null {
  for (const c of candidatesFor(ref, prefixes)) {
    const path = joinRelative('', c.path)
    if (path !== null && files.has(path)) return { file: path, prefix: c.prefix, extOmitted: c.extOmitted }
  }
  return null
}

/**
 * Whether a reference that resolves to nothing deserves a warning. TeX
 * Live provides many \input files (glyphtounicode…) and mwe's example
 * images, so a bare \input name or `example-image…` is not reported.
 */
export function reportsMissing(ref: TexRef): boolean {
  const arg = unquote(ref.arg)
  if (ref.command === 'includegraphics' || ref.command === 'includesvg') return !/^example-image/.test(arg)
  if (ref.command === 'input' || ref.command === 'subfile') return arg.includes('/') || /\.tex$/i.test(arg)
  return true
}

export interface MissingRef {
  file: string
  line: number
  command: TexRef['command']
  arg: string
}

export interface Rewrite {
  /** The file (stored path) the edit is in. */
  file: string
  line: number
  command: TexRef['command'] | 'graphicspath'
  from: string
  to: string
}

interface Edit {
  start: number
  end: number
  text: string
  rewrite: Omit<Rewrite, 'file'>
}

/** Each folder segment sanitised as asset storage does ('my figs' → 'my_figs'). */
export function sanitizeDir(dir: string): string {
  return dir
    .split('/')
    .map((s) => (s === '' || s === '.' ? s : sanitizeSegment(s)))
    .join('/')
}

function stripExt(path: string): string {
  return path.replace(/\.[^./]+$/, '')
}

export interface ProjectTextFile {
  /** Path in the zip (references resolve against these). */
  path: string
  /** Path it is stored at. */
  storedPath: string
  text: string
}

export interface ReferenceReport {
  /** New text per original path, only for files that changed. */
  texts: Map<string, string>
  rewrites: Rewrite[]
  missing: MissingRef[]
}

/**
 * Check and rewrite every text file's references. `files` holds the
 * original paths of everything that will exist; `renames` maps original →
 * stored for the files whose path changed.
 */
export function processReferences(
  textFiles: readonly ProjectTextFile[],
  files: ReadonlySet<string>,
  renames: ReadonlyMap<string, string>,
): ReferenceReport {
  const scans = textFiles.map((f) => ({ f, scan: scanTex(f.text) }))
  const prefixes = graphicsPrefixes(scans.flatMap((s) => s.scan.graphicsPaths))
  const renamedDirs = new Set<string>()
  for (const [from, to] of renames) {
    const a = from.split('/').slice(0, -1).join('/')
    const b = to.split('/').slice(0, -1).join('/')
    if (a !== b) renamedDirs.add(a)
  }

  const texts = new Map<string, string>()
  const rewrites: Rewrite[] = []
  const missing: MissingRef[] = []
  for (const { f, scan } of scans) {
    const edits: Edit[] = []
    for (const ref of scan.refs) {
      const hit = resolveRef(ref, files, prefixes)
      if (!hit) {
        if (reportsMissing(ref)) missing.push({ file: f.storedPath, line: ref.line, command: ref.command, arg: ref.arg })
        continue
      }
      const target = renames.get(hit.file)
      if (!target) continue
      const newPrefix = hit.prefix ? sanitizeDir(hit.prefix) : ''
      let rel = newPrefix && target.startsWith(newPrefix) ? target.slice(newPrefix.length) : target
      if (hit.extOmitted) rel = stripExt(rel)
      if (rel === ref.arg) continue
      edits.push({ start: ref.start, end: ref.end, text: rel, rewrite: { line: ref.line, command: ref.command, from: ref.arg, to: rel } })
    }
    for (const g of scan.graphicsPaths) {
      const dir = joinRelative('', g.dir)
      if (dir === null || dir === '' || !renamedDirs.has(dir)) continue
      const lead = g.dir.startsWith('./') ? './' : ''
      const trail = g.dir.endsWith('/') ? '/' : ''
      const next = `${lead}${sanitizeDir(dir)}${trail}`
      if (next === g.dir) continue
      edits.push({ start: g.start, end: g.end, text: next, rewrite: { line: g.line, command: 'graphicspath', from: g.dir, to: next } })
    }
    if (edits.length === 0) continue
    edits.sort((a, b) => b.start - a.start)
    let text = f.text
    for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end)
    texts.set(f.path, text)
    rewrites.push(...edits.reverse().map((e) => ({ file: f.storedPath, ...e.rewrite })))
  }
  return { texts, rewrites, missing }
}
