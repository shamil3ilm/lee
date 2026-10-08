// Turn a validated zip scan into an import plan: the main file (the
// document source), the files to store at which paths, what was renamed and
// rewritten, the compiler to preselect, and the warnings the review shows.
// Pure: the UI stores the plan, tests check it.

import { MAIN_FILE } from '../file-kinds'
import type { CompileEngine, CompileService } from '../compile-settings'
import { detectBibliography, detectEngine, detectMainFile, type BibDetection, type EngineDetection, type MainDetection, type TextSource } from './detect'
import { mimeForPath } from './file-types'
import { formatBytes } from './format'
import { LARGE_PROJECT_BYTES, MAX_MAIN_FILE_BYTES } from './limits'
import { isSafeProjectPath, sanitizeAssetPath } from './paths'
import { processReferences, type MissingRef, type Rewrite } from './references'
import type { SkippedEntry, ZipScan } from './zip-read'

/** new: a new document; replace: the current project is replaced; add: files are added to it. */
export type ImportMode = 'new' | 'replace' | 'add'

export interface PlanOptions {
  mode: ImportMode
  /** The main file the user picked (a zip path); null = the detected one. */
  mainPath?: string | null
  /** add: asset paths already in the document. */
  existingPaths?: readonly string[]
  /** Largest file the storage takes (5 MB, or 4 MB through a function). */
  maxFileBytes: number
  /** Most files the document can still take. */
  maxFiles: number
}

export interface PlannedFile {
  /** Path in the zip. */
  from: string
  /** Path it is stored at (the asset name). */
  path: string
  bytes: Uint8Array
  mimeType: string
  text: boolean
  /** References inside were rewritten. */
  rewritten: boolean
}

export type WarningKind = 'missing' | 'large' | 'skipped' | 'renamed'

export interface ImportWarning {
  kind: WarningKind
  message: string
  /** Stored path, for a click-to-open warning. */
  file?: string
  line?: number
}

export interface ImportPlan {
  mode: ImportMode
  detection: MainDetection
  /** The main file and its (possibly rewritten) text: the document source. */
  main: { from: string; source: string } | null
  files: PlannedFile[]
  skipped: SkippedEntry[]
  renames: Array<{ from: string; to: string }>
  rewrites: Rewrite[]
  missing: MissingRef[]
  warnings: ImportWarning[]
  /** Blocking problems: nothing is stored while any remain. */
  errors: string[]
  engine: EngineDetection
  bib: BibDetection
  /** Settings to apply (new and replace only). */
  settings: { engine: CompileEngine; service: CompileService | null } | null
  totalBytes: number
}

const decoder = new TextDecoder('utf-8')
const encoder = new TextEncoder()

/** `name.ext` → `name-1.ext` (in the same folder). */
export function withSuffix(path: string, n: number): string {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  return dot > slash + 1 ?`${path.slice(0, dot)}-${n}${path.slice(dot)}` : `${path}-${n}`
}

function uniquePath(path: string, taken: ReadonlySet<string>): string {
  if (!taken.has(path)) return path
  for (let n = 1; ; n++) {
    const next = withSuffix(path, n)
    if (!taken.has(next)) return next
  }
}

function missingMessage(m: MissingRef): string {
  return `\\${m.command}{${m.arg}} in ${m.file}, line ${m.line}: no such file in the project`
}

export function planImport(scan: ZipScan, opts: PlanOptions): ImportPlan {
  const texts = new Map<string, string>()
  for (const f of scan.files) if (f.kind === 'text') texts.set(f.path, decoder.decode(f.bytes))
  const texSources: TextSource[] = [...texts].filter(([p]) => /\.tex$/i.test(p)).map(([path, text]) => ({ path, text }))
  const detection = detectMainFile(texSources, scan.latexmkrc)
  const errors: string[] = []
  const skipped: SkippedEntry[] = [...scan.skipped]

  const wantsMain = opts.mode !== 'add'
  const mainPath = wantsMain ? (opts.mainPath ?? detection.main) : null
  if (wantsMain && mainPath === null) {
    errors.push(
      detection.candidates.length > 0
        ? 'Pick the main file.'
        : 'No file has both \\documentclass and \\begin{document}, so there is no main file to compile.',
    )
  }
  if (mainPath !== null && !texts.has(mainPath)) errors.push(`${mainPath} is not a .tex file in the zip.`)

  // Stored paths: sanitised, collision-safe; main.tex is the document source.
  const taken = new Set<string>([MAIN_FILE])
  const existing = new Set(opts.existingPaths ?? [])
  const files: PlannedFile[] = []
  const renames: Array<{ from: string; to: string }> = []
  for (const f of [...scan.files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (f.path === mainPath) continue
    const safe = sanitizeAssetPath(f.path)
    if (!isSafeProjectPath(safe) || (f.path.includes('/') && !safe.includes('/'))) {
      skipped.push({ path: f.path, reason: 'Path too long or too deeply nested (100 characters, 8 levels)' })
      continue
    }
    if (existing.has(safe)) {
      skipped.push({ path: f.path, reason: 'Already in this document' })
      continue
    }
    if (f.bytes.byteLength > opts.maxFileBytes) {
      skipped.push({ path: f.path, reason: `Larger than ${formatBytes(opts.maxFileBytes)}, the per-file storage limit` })
      continue
    }
    const path = uniquePath(safe, new Set([...taken, ...existing]))
    taken.add(path)
    if (path !== f.path) renames.push({ from: f.path, to: path })
    files.push({ from: f.path, path, bytes: f.bytes, mimeType: mimeForPath(f.path), text: f.kind === 'text', rewritten: false })
  }
  if (files.length > opts.maxFiles) {
    errors.push(`The project has ${files.length} files to store; this document can take ${opts.maxFiles} more.`)
  }

  // References resolve against the zip's own layout, then follow renames.
  const present = new Set<string>([...files.map((f) => f.from), ...(mainPath ? [mainPath] : [])])
  const textFiles = [
    ...(mainPath && texts.has(mainPath) ? [{ path: mainPath, storedPath: MAIN_FILE, text: texts.get(mainPath)! }] : []),
    ...files.filter((f) => f.text).map((f) => ({ path: f.from, storedPath: f.path, text: texts.get(f.from) ?? '' })),
  ]
  const refs = processReferences(textFiles, present, new Map(renames.map((r) => [r.from, r.to])))
  const planned = files.map((f) => {
    const next = refs.texts.get(f.from)
    return next === undefined ? f : { ...f, bytes: encoder.encode(next), rewritten: true }
  })
  const mainSource = mainPath && texts.has(mainPath) ? (refs.texts.get(mainPath) ?? texts.get(mainPath)!) : null
  if (mainSource !== null && encoder.encode(mainSource).byteLength > MAX_MAIN_FILE_BYTES) {
    errors.push(`${mainPath} is larger than ${formatBytes(MAX_MAIN_FILE_BYTES)}; split it with \\input.`)
  }

  const mainText = mainPath && mainSource !== null ? { path: mainPath, text: mainSource } : null
  const engine = detectEngine(mainText, texSources, scan.latexmkrc)
  const bib = detectBibliography(texSources)
  const totalBytes = planned.reduce((s, f) => s + f.bytes.byteLength, 0) + (mainSource ? encoder.encode(mainSource).byteLength : 0)

  const warnings: ImportWarning[] = refs.missing.map((m) => ({ kind: 'missing', message: missingMessage(m), file: m.file, line: m.line }))
  const unsupported = skipped.filter((s) => s.reason.startsWith('Unsupported'))
  if (unsupported.length > 0) {
    warnings.push({ kind: 'skipped', message: `${unsupported.length} unsupported file${unsupported.length === 1 ? '' : 's'} will not be imported.` })
  }
  if (renames.length > 0) {
    warnings.push({ kind: 'renamed', message: `${renames.length} file${renames.length === 1 ? '' : 's'} renamed to storage-safe names; references were updated.` })
  }
  if (totalBytes > LARGE_PROJECT_BYTES) {
    warnings.push({ kind: 'large', message: `This is a large project (${formatBytes(totalBytes)}); compiles may be slow.` })
  }

  return {
    mode: opts.mode,
    detection,
    main: mainPath && mainSource !== null ? { from: mainPath, source: mainSource } : null,
    files: planned,
    skipped,
    renames,
    rewrites: refs.rewrites,
    missing: refs.missing,
    warnings,
    errors,
    engine,
    bib,
    settings: wantsMain ? { engine: engine.engine, service: bib.service } : null,
    totalBytes,
  }
}

/** The files of an editor project, for "Download project (.zip)". */
export interface ProjectEntry {
  path: string
  bytes: Uint8Array
}

/**
 * Export layout: the document source at its original main-file path
 * (main.tex unless the import said otherwise), every asset at its path. An
 * asset that would clash with the main file's path is left out.
 */
export function projectEntries(source: string, mainFile: string | null | undefined, assets: readonly ProjectEntry[]): ProjectEntry[] {
  const mainPath = mainFile && isSafeProjectPath(mainFile) ? mainFile : MAIN_FILE
  return [{ path: mainPath, bytes: encoder.encode(source) }, ...assets.filter((a) => a.path !== mainPath)]
}
