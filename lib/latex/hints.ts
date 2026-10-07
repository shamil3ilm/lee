// ---------------------------------------------------------------------------
// Parse a compile log for well-known error shapes and surface a one-line
// suggested action. The output is UI-facing copy — the raw log is still
// shown for context, but a hint makes the fix a single action away.
// ---------------------------------------------------------------------------

import { hasShim } from './shims'
import { declaredPackages, packageUsage } from './missing'
import { looksLikeFilePath, pathFileName } from './path-paste'

/** A fix the editor can offer next to the hint. */
export type HintAction = 'use_fallback' | 'remove_package' | 'switch_engine' | 'upload_file' | 'import_file'

export interface LatexHint {
  /** Human-readable suggestion shown next to the raw log. */
  message: string
  /** Machine-readable tag for automation (tests, future auto-fix). */
  kind:
    | 'missing_package'
    | 'missing_class'
    | 'missing_asset'
    | 'undefined_command'
    | 'missing_font'
    | 'unclosed_environment'
    | 'wrong_engine'
    | 'file_path'
  /** Fixes worth offering, best first. */
  actions?: HintAction[]
  /** The package / class / file the hint is about, when there is one. */
  subject?: string
}

const FALLBACK_TIP = 'choose Compile service › Automatic or Full TeX Live in the Recompile menu'

/**
 * A `.sty` was not found. The document already loads it (that is why TeX
 * looked for it), so "add \usepackage" is never the fix: the service lacks
 * it. Offer the fallback compiler, and removal when nothing uses it.
 */
export function missingPackageHint(pkg: string, source?: string): LatexHint {
  const base = `The compile service doesn't have package ${pkg}.`
  const loadedDirectly = source === undefined || declaredPackages(source).includes(pkg)
  if (!loadedDirectly) {
    return {
      kind: 'missing_package',
      subject: pkg,
      actions: ['use_fallback'],
      message: `${base} Your document class or another package loads it: ${FALLBACK_TIP}.`,
    }
  }
  const usage = source === undefined ? 'unknown' : packageUsage(source, pkg)
  const shim = hasShim(pkg) ? ` lee also has a stand-in for ${pkg} (icons shown as text) when no full TeX Live is reachable.` : ''
  if (usage === 'unused') {
    return {
      kind: 'missing_package',
      subject: pkg,
      actions: ['remove_package', 'use_fallback'],
      message: `${base} None of its commands are used: remove \\usepackage{${pkg}} (or ${FALLBACK_TIP}).`,
    }
  }
  if (usage === 'used') {
    return {
      kind: 'missing_package',
      subject: pkg,
      actions: ['use_fallback'],
      message: `${base} Your document uses it: ${FALLBACK_TIP}.${shim}`,
    }
  }
  return {
    kind: 'missing_package',
    subject: pkg,
    actions: ['use_fallback', 'remove_package'],
    message: `${base} To fix it, ${FALLBACK_TIP}; if you don't use it, remove \\usepackage{${pkg}}.${shim}`,
  }
}

export function filePathHint(source: string): LatexHint {
  const name = pathFileName(source)
  return {
    kind: 'file_path',
    subject: name ?? undefined,
    actions: ['import_file'],
    message: `That's a file path, not LaTeX. Browsers can't read files from your computer by path: import ${name ?? 'the file'} instead.`,
  }
}

type HintFactory = (match: RegExpMatchArray, source: string | undefined) => LatexHint

const HINT_PATTERNS: { pattern: RegExp; toHint: HintFactory }[] = [
  {
    // "! LaTeX Error: File `pdfpages.sty' not found."
    pattern: /File `([\w.+-]+)\.sty' not found/,
    toHint: (m, source) => missingPackageHint(m[1]!, source),
  },
  {
    // "! LaTeX Error: File `altacv.cls' not found."
    pattern: /File `([\w.+-]+)\.cls' not found/,
    toHint: (m) => ({
      kind: 'missing_class',
      subject: m[1],
      actions: ['use_fallback', 'upload_file'],
      message: `The compile service doesn't have the document class ${m[1]}. Upload ${m[1]}.cls via the Assets panel, or ${FALLBACK_TIP}.`,
    }),
  },
  {
    // "! LaTeX Error: File `foo.tex' not found." — non-.sty missing input.
    pattern: /File `([^']+)' not found/,
    toHint: (m) => ({
      kind: 'missing_asset',
      subject: m[1],
      actions: ['upload_file'],
      message: `Missing file "${m[1]}" — upload it via the Assets panel (or fix the filename).`,
    }),
  },
  {
    // fontspec / xltxtra under pdfLaTeX.
    pattern: /cannot-use-pdftex|XeTeX is required|requires either XeTeX or LuaTeX/i,
    toHint: () => ({
      kind: 'wrong_engine',
      actions: ['switch_engine'],
      message: 'This document needs XeLaTeX or LuaLaTeX (it loads fontspec): pick it under Compiler in the Recompile menu.',
    }),
  },
  {
    // "! Font T1/OpenSans/m/n/10.95=OpenSans-Regular not loadable"
    pattern: /Font [^ ]+=([\w-]+)[^ ]* not loadable/,
    toHint: (m) => ({
      kind: 'missing_font',
      subject: m[1],
      actions: ['use_fallback'],
      message: `Font "${m[1]}" is not available on the compile service: ${FALLBACK_TIP}, or swap to a bundled font (e.g. Latin Modern).`,
    }),
  },
  {
    // "! Undefined control sequence.\nl.5 \foo" (raw) or
    // "main.tex:5: error: Undefined control sequence\n  at \foo" (latexonline).
    // TeX breaks the context line right after the offending command, so it
    // is the LAST command on that line.
    // latexonline also prints a caret line under the break point.
    pattern: /Undefined control sequence\.?[^\n]*\n(?:[^\n]*\n){0,3}?(\s*at |l\.\d+ )([^\n]*\\[A-Za-z@]+[^\n]*)(?:\n( *)\^)?/,
    toHint: (m) => {
      const caret = m[3] === undefined ? -1 : m[3].length - m[1]!.length
      const context = caret > 0 ? m[2]!.slice(0, caret) : m[2]!
      const commands = [...context.matchAll(/\\([A-Za-z@]+)/g)]
      const name = commands.at(-1)?.[1] ?? ''
      return {
        kind: 'undefined_command',
        subject: name,
        message: `\\${name} is undefined — check the spelling or add the \\usepackage that defines it.`,
      }
    },
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
 * useful is recognised. With the document `source`, a missing-package hint
 * also says whether the package is actually used. Callers should still show
 * the raw log — the hint is additive, not a replacement.
 */
export function extractLatexHint(log: string, source?: string): LatexHint | null {
  // A pasted local path ("C:\Users\me\cv.tex") makes TeX report \Users, \me …
  // as undefined commands; the fix is importing the file, not a package.
  if (source !== undefined && looksLikeFilePath(source)) return filePathHint(source)
  if (!log) return null
  for (const { pattern, toHint } of HINT_PATTERNS) {
    const m = log.match(pattern)
    if (m) return toHint(m, source)
  }
  return null
}
