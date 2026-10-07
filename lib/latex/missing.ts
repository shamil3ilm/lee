// ---------------------------------------------------------------------------
// What a failed compile was missing, and whether the document needs it.
// Client-safe: used by the compile fallback (server) and the editor's hint.
// ---------------------------------------------------------------------------

export interface MissingResources {
  packages: string[]
  classes: string[]
  fonts: string[]
}

const MISSING_FILE = /File `([\w.+-]+)\.(sty|cls)' not found/g
const MISSING_FONT = [
  /Font [^\s=]+=([\w-]+)[^\s]* not loadable/g,
  /The font "([^"]+)" cannot be found/g,
  /kpathsea: Running mktextfm ([\w-]+)/g,
]

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/** Packages, classes and fonts a compile log reports as not found. */
export function missingResources(log: string): MissingResources {
  const text = log ?? ''
  const packages: string[] = []
  const classes: string[] = []
  for (const m of text.matchAll(MISSING_FILE)) (m[2] === 'sty' ? packages : classes).push(m[1]!)
  const fonts = MISSING_FONT.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]!))
  return { packages: uniq(packages), classes: uniq(classes), fonts: uniq(fonts) }
}

export function hasMissingResources(m: MissingResources): boolean {
  return m.packages.length + m.classes.length + m.fonts.length > 0
}

/** `fontspec` and friends under pdfLaTeX: an engine problem, not a missing file. */
export function needsUnicodeEngine(log: string): boolean {
  return /cannot-use-pdftex|XeTeX is required|requires either XeTeX or LuaTeX/i.test(log ?? '')
}

/** The source with `%` comments removed (an escaped `\%` is kept). */
export function stripTexComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/(^|[^\\])%.*$/, '$1'))
    .join('\n')
}

/** Every package named by \usepackage / \RequirePackage, in order. */
export function declaredPackages(source: string): string[] {
  const out: string[] = []
  const re = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g
  for (const m of stripTexComments(source).matchAll(re)) {
    for (const name of m[1]!.split(',')) if (name.trim()) out.push(name.trim())
  }
  return uniq(out)
}

/**
 * Commands and environments a package provides, used to tell whether a
 * document actually uses a package it loads. Only packages common in résumé
 * templates are listed; others are "unknown".
 */
const PACKAGE_USAGE: Readonly<Record<string, RegExp>> = {
  fontawesome5: /\\fa[A-Z][A-Za-z]*|\\faIcon\b/,
  fontawesome6: /\\fa[A-Z][A-Za-z]*|\\faIcon\b/,
  fontawesome: /\\fa[A-Z][A-Za-z]*/,
  academicons: /\\ai[A-Z][A-Za-z]*|\\aiicon\b/,
  simpleicons: /\\si[A-Z][A-Za-z]*|\\simpleicon\b/,
  paracol: /\\begin\{paracol\}|\\switchcolumn|\\setcolumnwidth/,
  'eso-pic': /\\AddToShipoutPicture|\\ClearShipoutPicture|\\AtPage(?:Lower|Upper)Left|\\AtTextCenter/,
  changepage: /\\begin\{adjustwidth\*?\}|\\checkoddpage/,
  needspace: /\\[nN]eedspace\b/,
  lastpage: /LastPage/,
  tabularx: /\\begin\{tabularx\}/,
  ragged2e: /\\justifying|\\Raggedright|\\RaggedRight|\\RaggedLeft|\\Centering|\\begin\{(?:FlushLeft|FlushRight|Center|justify)\}/,
  titlesec: /\\titleformat|\\titlespacing|\\titlerule|\\titlelabel/,
  multicol: /\\begin\{multicols\*?\}/,
  marvosym: /\\(?:Letter|Mobilefone|Telefon|Email|Mundus|Lightning)\b/,
  tikz: /\\begin\{tikzpicture\}|\\tikz\b|\\draw\b|\\node\b/,
  graphicx: /\\includegraphics|\\rotatebox|\\scalebox|\\resizebox|\\reflectbox/,
  hyperref: /\\href|\\url|\\hypersetup|\\hyperlink|\\hypertarget|\\autoref/,
}

/** 1-based line of the first uncommented \usepackage that loads `pkg`, or null. */
export function packageLine(source: string, pkg: string): number | null {
  const lines = stripTexComments(source).split('\n')
  const i = lines.findIndex((line) =>
    [...line.matchAll(/\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].some((m) =>
      m[1]!.split(',').some((n) => n.trim() === pkg),
    ),
  )
  return i === -1 ? null : i + 1
}

export type PackageUsage = 'used' | 'unused' | 'unknown'

/** Whether a document's body/preamble uses any command the package provides. */
export function packageUsage(source: string, pkg: string): PackageUsage {
  const re = PACKAGE_USAGE[pkg]
  if (!re) return 'unknown'
  const withoutLoads = stripTexComments(source).replace(
    /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g,
    '',
  )
  return re.test(withoutLoads) ? 'used' : 'unused'
}
