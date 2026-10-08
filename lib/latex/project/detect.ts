// What a project import detects: the main file, the compiler (latexmkrc,
// a `% !TEX program` line, fontspec and friends) and the bibliography tool.

import type { CompileEngine, CompileService } from '../compile-settings'
import { MAIN_FILE } from '../file-kinds'
import { basename, dirname, joinRelative } from './paths'
import { isRootDocument, loadedPackages, maskComments } from './tex-scan'

export interface TextSource {
  path: string
  text: string
}

export type MainReason = 'root-setting' | 'main.tex' | 'only-candidate' | 'choose' | 'none'

export interface MainDetection {
  /** The main file, or null when the user has to pick (or there is none). */
  main: string | null
  /** Every complete document (\documentclass + \begin{document}). */
  candidates: string[]
  reason: MainReason
  /** Where a root setting came from ("latexmkrc", "% !TEX root in x.tex"). */
  rootSource?: string
}

const TEX_ROOT = /^\s*%\s*!\s*TEX\s+root\s*=\s*(.+?)\s*$/im

function byDepthThenName(a: string, b: string): number {
  return a.split('/').length - b.split('/').length || a.localeCompare(b)
}

/** `@default_files = ('thesis.tex');` in a latexmkrc. */
export function latexmkrcDefaultFile(rc: string | null): string | null {
  if (!rc) return null
  const m = /@default_files\s*=\s*\(\s*['"]([^'"]+)['"]/.exec(rc)
  return m ? m[1]!.trim() : null
}

function withTex(path: string): string {
  return /\.tex$/i.test(path) ? path : `${path}.tex`
}

/**
 * The main file: an explicit root setting (latexmkrc's @default_files, or
 * a `% !TEX root = …` line) when it names a complete document; else
 * main.tex at the top; else the only complete document. With several and
 * no hint, the user picks.
 */
export function detectMainFile(texFiles: readonly TextSource[], latexmkrc: string | null): MainDetection {
  const candidates = texFiles
    .filter((f) => /\.tex$/i.test(f.path) && isRootDocument(f.text))
    .map((f) => f.path)
    .sort(byDepthThenName)
  const isCandidate = (p: string | null): p is string => p !== null && candidates.includes(p)

  const rcFile = latexmkrcDefaultFile(latexmkrc)
  const rcPath = rcFile ? joinRelative('', withTex(rcFile)) : null
  if (isCandidate(rcPath)) return { main: rcPath, candidates, reason: 'root-setting', rootSource: 'latexmkrc' }

  for (const f of texFiles) {
    const m = TEX_ROOT.exec(f.text)
    if (!m) continue
    const target = joinRelative(dirname(f.path), withTex(m[1]!.replace(/^["']|["']$/g, '')))
    if (isCandidate(target)) return { main: target, candidates, reason: 'root-setting', rootSource: `% !TEX root in ${f.path}` }
  }

  if (candidates.includes(MAIN_FILE)) return { main: MAIN_FILE, candidates, reason: 'main.tex' }
  if (candidates.length === 1) return { main: candidates[0]!, candidates, reason: 'only-candidate' }
  return { main: null, candidates, reason: candidates.length === 0 ? 'none' : 'choose' }
}

export type EngineReason = 'latexmkrc' | 'magic-comment' | 'package' | 'default'

export interface EngineDetection {
  engine: CompileEngine
  reason: EngineReason
  /** Plain-language why, for the review step. */
  detail: string
}

const PDF_MODE: Readonly<Record<string, CompileEngine>> = { '1': 'pdflatex', '4': 'lualatex', '5': 'xelatex' }
const ENGINE_NAMES: Readonly<Record<CompileEngine, string>> = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX' }

/** The engine a latexmkrc selects, if any. */
export function engineFromLatexmkrc(rc: string | null): CompileEngine | null {
  if (!rc) return null
  const code = rc
    .split('\n')
    .map((l) => l.replace(/#.*$/, ''))
    .join('\n')
  const mode = /\$pdf_mode\s*=\s*['"]?(\d)/.exec(code)
  if (mode && PDF_MODE[mode[1]!]) return PDF_MODE[mode[1]!]!
  const cmd = /\$pdflatex\s*=\s*['"]\s*(xelatex|lualatex|pdflatex)\b/i.exec(code)
  if (cmd) return cmd[1]!.toLowerCase() as CompileEngine
  if (/(^|[\s'"])-(?:xelatex|pdfxe)\b/.test(code)) return 'xelatex'
  if (/(^|[\s'"])-(?:lualatex|pdflua)\b/.test(code)) return 'lualatex'
  return null
}

const PROGRAM = /^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*(pdflatex|xelatex|lualatex)\b/im

const XE_PACKAGES = ['fontspec', 'unicode-math', 'polyglossia', 'xeCJK', 'xltxtra', 'mathspec', 'xunicode']
const LUA_PACKAGES = ['luacode', 'luatexja', 'luaotfload', 'luatextra']

/**
 * The compiler to preselect: latexmkrc first, then a `% !TEX program`
 * line in the main file, then the packages (fontspec and friends need
 * XeLaTeX or LuaLaTeX; lee suggests XeLaTeX), else pdfLaTeX.
 */
export function detectEngine(main: TextSource | null, texFiles: readonly TextSource[], latexmkrc: string | null): EngineDetection {
  const rc = engineFromLatexmkrc(latexmkrc)
  if (rc) return { engine: rc, reason: 'latexmkrc', detail: `latexmkrc selects ${ENGINE_NAMES[rc]}.` }
  const magic = main ? PROGRAM.exec(main.text) : null
  if (magic) {
    const engine = magic[1]!.toLowerCase() as CompileEngine
    return { engine, reason: 'magic-comment', detail: `${basename(main!.path)} asks for ${ENGINE_NAMES[engine]} (% !TEX program).` }
  }
  const packages = new Map<string, string>()
  for (const f of texFiles) for (const [k, v] of loadedPackages(f.text)) packages.set(k, v)
  const lua = LUA_PACKAGES.find((p) => packages.has(p))
  if (lua) return { engine: 'lualatex', reason: 'package', detail: `\\usepackage{${lua}} needs LuaLaTeX.` }
  const xe = XE_PACKAGES.find((p) => packages.has(p))
  if (xe) return { engine: 'xelatex', reason: 'package', detail: `\\usepackage{${xe}} needs XeLaTeX or LuaLaTeX; XeLaTeX is suggested.` }
  return { engine: 'pdflatex', reason: 'default', detail: 'No engine setting found; pdfLaTeX is the default.' }
}

export interface BibDetection {
  tool: 'biber' | 'bibtex' | null
  /** A compile service to preselect, when the tool needs one. */
  service: CompileService | null
  detail: string | null
}

/**
 * The bibliography tool: biblatex runs biber unless `backend=bibtex`;
 * `\bibliography{…}` runs BibTeX. Verified 2026-10-08: latexonline.cc runs
 * BibTeX but not biber (citations stay "[key]"), YtoTech runs both. So a
 * biber project is preselected for Full TeX Live (YtoTech).
 */
export function detectBibliography(texFiles: readonly TextSource[]): BibDetection {
  let biblatexOptions: string | null = null
  let bibtex = false
  for (const f of texFiles) {
    const pk = loadedPackages(f.text)
    if (pk.has('biblatex')) biblatexOptions = pk.get('biblatex') ?? ''
    if (/\\bibliography\s*\{/.test(maskComments(f.text))) bibtex = true
  }
  if (biblatexOptions !== null) {
    if (/backend\s*=\s*bibtex/.test(biblatexOptions)) {
      return { tool: 'bibtex', service: null, detail: 'biblatex with backend=bibtex: both compile services run BibTeX.' }
    }
    return {
      tool: 'biber',
      service: 'ytotech',
      detail: "biblatex uses biber. latexonline.cc doesn't run biber, so the compile service is set to Full TeX Live (YtoTech).",
    }
  }
  if (bibtex) return { tool: 'bibtex', service: null, detail: '\\bibliography uses BibTeX, which both compile services run.' }
  return { tool: null, service: null, detail: null }
}
