import { describe, expect, it } from 'vitest'
import { zipSync, type Zippable } from 'fflate'
import { readZipProject, ZipImportError, normalizeZipPath } from '@/lib/latex/project/zip-read'
import { planImport, projectEntries, type PlanOptions } from '@/lib/latex/project/plan'
import { buildProjectZip } from '@/lib/latex/project/zip-write'
import { detectMainFile, detectEngine, detectBibliography, engineFromLatexmkrc } from '@/lib/latex/project/detect'
import { scanTex, maskComments } from '@/lib/latex/project/tex-scan'
import { sanitizeAssetPath, isSafeProjectPath, joinRelative, assetUrl } from '@/lib/latex/project/paths'
import { MAX_ZIP_ENTRIES, MAX_ZIP_FILE_BYTES } from '@/lib/latex/project/limits'
import { treeRows, visibleRows } from '@/lib/latex/project/tree'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function zip(files: Record<string, string | Uint8Array>, level: 0 | 6 = 6): Uint8Array {
  const z: Zippable = {}
  for (const [k, v] of Object.entries(files)) z[k] = [typeof v === 'string' ? enc(v) : v, { level }]
  return zipSync(z)
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (err) {
    return err instanceof ZipImportError ? err.code : 'other'
  }
}

const MAIN = String.raw`\documentclass{article}
\usepackage{graphicx}
\graphicspath{{figures/}}
\begin{document}
\input{sections/intro}
\includegraphics[width=1cm]{logo}
\cite{knuth}
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`
const OVERLEAF = {
  'main.tex': MAIN,
  'sections/intro.tex': 'Hello from intro.\n',
  'figures/logo.png': PNG,
  'refs.bib': '@book{knuth, author={Donald Knuth}, title={The TeXbook}, year={1984}}\n',
}

const NEW: PlanOptions = { mode: 'new', maxFileBytes: 5 * 1024 * 1024, maxFiles: 100 }

describe('zip validation guards', () => {
  it('reads an Overleaf-like project with folders', () => {
    const scan = readZipProject(zip(OVERLEAF))
    expect(scan.files.map((f) => f.path).sort()).toEqual(['figures/logo.png', 'main.tex', 'refs.bib', 'sections/intro.tex'])
    expect(scan.files.find((f) => f.path === 'figures/logo.png')!.bytes).toEqual(PNG)
  })

  it('rejects absolute paths and .. segments (zip-slip)', () => {
    expect(codeOf(() => readZipProject(zip({ 'main.tex': MAIN, '../evil.tex': 'x' })))).toBe('unsafe_path')
    expect(codeOf(() => readZipProject(zip({ 'main.tex': MAIN, 'a/../../evil.tex': 'x' })))).toBe('unsafe_path')
    expect(codeOf(() => readZipProject(zip({ 'main.tex': MAIN, '/etc/passwd.tex': 'x' })))).toBe('unsafe_path')
    expect(normalizeZipPath('C:\\Users\\x.tex')).toEqual({ kind: 'unsafe' })
    expect(normalizeZipPath('a\\b\\c.tex')).toEqual({ kind: 'file', path: 'a/b/c.tex' })
    expect(normalizeZipPath('./a//b.tex')).toEqual({ kind: 'file', path: 'a/b.tex' })
  })

  it('skips system and hidden files, lists unsupported types with the reason', () => {
    const scan = readZipProject(
      zip({ ...OVERLEAF, '__MACOSX/._main.tex': 'x', '.DS_Store': 'x', 'figures/Thumbs.db': 'x', '.git/config.txt': 'x', 'notes.docx': 'x', 'run.sh': 'x' }),
    )
    expect(scan.files).toHaveLength(4)
    const reasons = Object.fromEntries(scan.skipped.map((s) => [s.path, s.reason]))
    expect(reasons['__MACOSX/._main.tex']).toMatch(/__MACOSX/)
    expect(reasons['.DS_Store']).toMatch(/macOS/)
    expect(reasons['figures/Thumbs.db']).toMatch(/Windows/)
    expect(reasons['.git/config.txt']).toBe('Hidden file')
    expect(reasons['notes.docx']).toBe('Unsupported file type (.docx)')
  })

  it('caps the number of entries', () => {
    const many: Record<string, string> = { 'main.tex': MAIN }
    for (let i = 0; i < MAX_ZIP_ENTRIES; i++) many[`f${i}.txt`] = 'x'
    expect(codeOf(() => readZipProject(zip(many)))).toBe('too_many_entries')
  })

  it('caps the total uncompressed size and skips oversized files', () => {
    // ~2:1 compressible (4 bits of entropy per byte): a 14 MB zip that expands past 25 MB.
    const big = new Uint8Array(7 * 1024 * 1024)
    for (let i = 0; i < big.length; i++) big[i] = Math.floor(Math.random() * 16)
    expect(codeOf(() => readZipProject(zip({ 'main.tex': MAIN, 'a.pdf': big, 'b.pdf': big, 'c.pdf': big, 'd.pdf': big })))).toBe('too_large')
    const scan = readZipProject(zip({ 'main.tex': MAIN, 'huge.pdf': new Uint8Array(MAX_ZIP_FILE_BYTES + 1) }, 0))
    expect(scan.files.map((f) => f.path)).toEqual(['main.tex'])
    expect(scan.skipped[0]!.reason).toMatch(/Larger than 10 MB/)
  })

  it('rejects a high compression ratio (zip bomb)', () => {
    expect(codeOf(() => readZipProject(zip({ 'main.tex': MAIN, 'bomb.txt': new Uint8Array(4 * 1024 * 1024) })))).toBe('zip_bomb')
  })

  it('rejects non-zips and empty projects', () => {
    expect(codeOf(() => readZipProject(enc('not a zip at all, just some text')))).toBe('invalid_zip')
    expect(codeOf(() => readZipProject(zip({ 'readme.docx': 'x' })))).toBe('empty')
  })

  it('removes a single wrapping folder', () => {
    const scan = readZipProject(zip({ 'project/main.tex': MAIN, 'project/figures/logo.png': PNG }))
    expect(scan.strippedFolder).toBe('project')
    expect(scan.files.map((f) => f.path).sort()).toEqual(['figures/logo.png', 'main.tex'])
  })
})

describe('main-file detection', () => {
  const doc = '\\documentclass{article}\n\\begin{document}x\\end{document}\n'
  it('prefers main.tex, else the only candidate', () => {
    expect(detectMainFile([{ path: 'main.tex', text: doc }, { path: 'cv.tex', text: doc }], null)).toMatchObject({ main: 'main.tex', reason: 'main.tex' })
    expect(detectMainFile([{ path: 'thesis.tex', text: doc }, { path: 'ch1.tex', text: 'x' }], null)).toMatchObject({ main: 'thesis.tex', reason: 'only-candidate' })
  })
  it('asks the user to pick between several candidates', () => {
    const d = detectMainFile([{ path: 'cv.tex', text: doc }, { path: 'letter.tex', text: doc }, { path: 'part.tex', text: 'x' }], null)
    expect(d).toMatchObject({ main: null, reason: 'choose', candidates: ['cv.tex', 'letter.tex'] })
  })
  it('ignores a commented-out \\documentclass', () => {
    const d = detectMainFile([{ path: 'a.tex', text: '% \\documentclass{article}\n\\begin{document}' }], null)
    expect(d.reason).toBe('none')
  })
  it('follows a root setting: latexmkrc @default_files and % !TEX root', () => {
    const files = [{ path: 'cv.tex', text: doc }, { path: 'main.tex', text: doc }]
    expect(detectMainFile(files, "@default_files = ('cv.tex');")).toMatchObject({ main: 'cv.tex', reason: 'root-setting' })
    const withMagic = [...files, { path: 'chapters/one.tex', text: '% !TEX root = ../cv.tex\nText' }]
    expect(detectMainFile(withMagic, null)).toMatchObject({ main: 'cv.tex', reason: 'root-setting' })
  })
})

describe('engine and bibliography preselect', () => {
  const main = (body: string) => ({ path: 'main.tex', text: `\\documentclass{article}\n${body}\n\\begin{document}\\end{document}` })
  it('reads latexmkrc', () => {
    expect(engineFromLatexmkrc('$pdf_mode = 5;')).toBe('xelatex')
    expect(engineFromLatexmkrc('$pdf_mode = 4;')).toBe('lualatex')
    expect(engineFromLatexmkrc("$pdflatex = 'xelatex %O %S';")).toBe('xelatex')
    expect(engineFromLatexmkrc('# $pdf_mode = 5;\n$pdf_mode = 1;')).toBe('pdflatex')
    expect(engineFromLatexmkrc('')).toBeNull()
    expect(detectEngine(main(''), [main('')], '$pdf_mode = 4;')).toMatchObject({ engine: 'lualatex', reason: 'latexmkrc' })
  })
  it('suggests XeLaTeX for fontspec, and honours % !TEX program', () => {
    const m = main('\\usepackage{fontspec}')
    expect(detectEngine(m, [m], null)).toMatchObject({ engine: 'xelatex', reason: 'package' })
    const commented = main('% \\usepackage{fontspec}')
    expect(detectEngine(commented, [commented], null)).toMatchObject({ engine: 'pdflatex', reason: 'default' })
    const magic = { path: 'main.tex', text: '% !TEX program = lualatex\n' + m.text }
    expect(detectEngine(magic, [magic], null)).toMatchObject({ engine: 'lualatex', reason: 'magic-comment' })
  })
  it('detects biber (YtoTech) vs BibTeX', () => {
    expect(detectBibliography([main('\\usepackage[backend=biber]{biblatex}')])).toMatchObject({ tool: 'biber', service: 'ytotech' })
    expect(detectBibliography([main('\\usepackage{biblatex}')])).toMatchObject({ tool: 'biber', service: 'ytotech' })
    expect(detectBibliography([main('\\usepackage[backend=bibtex]{biblatex}')])).toMatchObject({ tool: 'bibtex', service: null })
    expect(detectBibliography([main('\\bibliography{refs}')])).toMatchObject({ tool: 'bibtex', service: null })
  })
})

describe('tex scanning', () => {
  it('finds references with positions and ignores comments and macros', () => {
    const text = '% \\input{gone}\n\\includegraphics[width=2cm]{ a b }\n\\bibliography{x, y}\n\\input{\\jobname}\n'
    const { refs } = scanTex(text)
    expect(refs.map((r) => [r.command, r.arg, r.line])).toEqual([
      ['includegraphics', 'a b', 2],
      ['bibliography', 'x', 3],
      ['bibliography', 'y', 3],
    ])
    for (const r of refs) expect(text.slice(r.start, r.end)).toBe(r.arg)
    expect(maskComments('50\\% off % note')).toBe('50\\% off       ')
  })
})

describe('paths', () => {
  it('keeps clean folders and falls back to the base name otherwise', () => {
    expect(sanitizeAssetPath('figures/my logo.png')).toBe('figures/my_logo.png')
    expect(sanitizeAssetPath('../../etc/../photo of me.jpg')).toBe('photo_of_me.jpg')
    expect(sanitizeAssetPath('/abs/x.png')).toBe('x.png')
    expect(sanitizeAssetPath('C:\\Users\\a\\pic.png')).toBe('pic.png')
    expect(isSafeProjectPath('a/b.png')).toBe(true)
    expect(isSafeProjectPath('a/../b.png')).toBe(false)
    expect(isSafeProjectPath(`${'a'.repeat(101)}`)).toBe(false)
    expect(joinRelative('chapters', '../cv.tex')).toBe('cv.tex')
    expect(joinRelative('', '../x')).toBeNull()
    expect(assetUrl('d', 'my dir/a#b.png')).toBe('/api/documents/d/assets/my%20dir/a%23b.png')
  })
})

describe('import plan', () => {
  it('keeps the folder layout and makes main.tex the document source', () => {
    const plan = planImport(readZipProject(zip(OVERLEAF)), NEW)
    expect(plan.errors).toEqual([])
    expect(plan.main).toEqual({ from: 'main.tex', source: MAIN })
    expect(plan.files.map((f) => f.path)).toEqual(['figures/logo.png', 'refs.bib', 'sections/intro.tex'])
    expect(plan.renames).toEqual([])
    expect(plan.rewrites).toEqual([])
    expect(plan.missing).toEqual([])
    expect(plan.settings).toEqual({ engine: 'pdflatex', service: null })
  })

  it('reports missing referenced files with file and line', () => {
    const { 'figures/logo.png': _logo, ...rest } = OVERLEAF
    void _logo
    const plan = planImport(readZipProject(zip(rest)), NEW)
    expect(plan.missing).toEqual([{ file: 'main.tex', line: 6, command: 'includegraphics', arg: 'logo' }])
    expect(plan.warnings[0]).toMatchObject({ kind: 'missing', file: 'main.tex', line: 6 })
  })

  it('renames unsafe paths collision-safely and rewrites references', () => {
    const main = String.raw`\documentclass{article}
\graphicspath{{./my figs/}}
\begin{document}
\input{chapters/part one}
\includegraphics{a b}
\includegraphics{my figs/a_b.png}
\addbibresource{refs (1).bib}
\end{document}
`
    const plan = planImport(
      readZipProject(zip({ 'main.tex': main, 'chapters/part one.tex': 'x', 'my figs/a b.png': PNG, 'my figs/a_b.png': PNG, 'refs (1).bib': '' })),
      NEW,
    )
    expect(plan.renames).toEqual([
      { from: 'chapters/part one.tex', to: 'chapters/part_one.tex' },
      { from: 'my figs/a b.png', to: 'my_figs/a_b.png' },
      { from: 'my figs/a_b.png', to: 'my_figs/a_b-1.png' },
      { from: 'refs (1).bib', to: 'refs_1_.bib' },
    ])
    expect(plan.main!.source).toContain('\\graphicspath{{./my_figs/}}')
    expect(plan.main!.source).toContain('\\input{chapters/part_one}')
    expect(plan.main!.source).toContain('\\includegraphics{a_b}')
    expect(plan.main!.source).toContain('\\includegraphics{my_figs/a_b-1.png}')
    expect(plan.main!.source).toContain('\\addbibresource{refs_1_.bib}')
    expect(plan.rewrites.map((r) => r.command)).toEqual(['graphicspath', 'input', 'includegraphics', 'includegraphics', 'addbibresource'])
    expect(plan.missing).toEqual([])
  })

  it('moves a main file from another name to main.tex and renames a clashing main.tex', () => {
    const doc = '\\documentclass{article}\n\\begin{document}\\input{main}\\end{document}\n'
    const plan = planImport(readZipProject(zip({ 'thesis.tex': doc, 'main.tex': 'part' })), { ...NEW, mainPath: 'thesis.tex' })
    expect(plan.main!.from).toBe('thesis.tex')
    expect(plan.files.map((f) => f.path)).toEqual(['main-1.tex'])
    expect(plan.main!.source).toContain('\\input{main-1}')
  })

  it('needs a choice between several mains, and blocks without one', () => {
    const doc = '\\documentclass{article}\n\\begin{document}\\end{document}\n'
    const scan = readZipProject(zip({ 'cv.tex': doc, 'letter.tex': doc }))
    expect(planImport(scan, NEW).errors).toEqual(['Pick the main file.'])
    const picked = planImport(scan, { ...NEW, mainPath: 'letter.tex' })
    expect(picked.errors).toEqual([])
    expect(picked.files.map((f) => f.path)).toEqual(['cv.tex'])
  })

  it('preselects the engine from latexmkrc and fontspec', () => {
    const doc = '\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\\end{document}\n'
    expect(planImport(readZipProject(zip({ 'main.tex': doc })), NEW).settings).toEqual({ engine: 'xelatex', service: null })
    const rc = planImport(readZipProject(zip({ 'main.tex': MAIN, '.latexmkrc': '$pdf_mode = 4;\n' })), NEW)
    expect(rc.settings).toEqual({ engine: 'lualatex', service: null })
    expect(rc.skipped.find((s) => s.path === '.latexmkrc')!.reason).toMatch(/compiler/)
  })

  it('add mode: skips files already in the document and keeps settings', () => {
    const plan = planImport(readZipProject(zip(OVERLEAF)), { mode: 'add', existingPaths: ['refs.bib'], maxFileBytes: 5e6, maxFiles: 10 })
    expect(plan.main).toBeNull()
    expect(plan.settings).toBeNull()
    expect(plan.files.map((f) => f.path)).toEqual(['figures/logo.png', 'main-1.tex', 'sections/intro.tex'])
    expect(plan.skipped.find((s) => s.path === 'refs.bib')!.reason).toBe('Already in this document')
  })

  it('blocks when the document cannot take that many files, skips files over the storage cap', () => {
    expect(planImport(readZipProject(zip(OVERLEAF)), { ...NEW, maxFiles: 2 }).errors[0]).toMatch(/3 files/)
    const plan = planImport(readZipProject(zip(OVERLEAF)), { ...NEW, maxFileBytes: 10 })
    expect(plan.skipped.find((s) => s.path === 'figures/logo.png')!.reason).toMatch(/per-file storage limit/)
  })
})

describe('file tree', () => {
  it('lists folders before files, nested with depths, and hides collapsed folders', () => {
    const rows = treeRows(['main.tex', 'sections/b.tex', 'sections/a/x.tex', 'figures/logo.png', 'refs.bib'])
    expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.type === 'folder' ? `${r.name}/` : r.name}`)).toEqual([
      'figures/',
      '  logo.png',
      'sections/',
      '  a/',
      '    x.tex',
      '  b.tex',
      'main.tex',
      'refs.bib',
    ])
    expect(visibleRows(rows, new Set(['sections'])).map((r) => r.path)).toEqual(['figures', 'figures/logo.png', 'sections', 'main.tex', 'refs.bib'])
  })
})

describe('export round trip', () => {
  it('import → export gives identical paths and content', () => {
    const original = zip(OVERLEAF)
    const plan = planImport(readZipProject(original), NEW)
    // What storage keeps: the source and each file at its stored path.
    const exported = buildProjectZip(projectEntries(plan.main!.source, plan.main!.from, plan.files.map((f) => ({ path: f.path, bytes: f.bytes }))))
    const back = readZipProject(exported)
    const asMap = (files: { path: string; bytes: Uint8Array }[]) => Object.fromEntries(files.map((f) => [f.path, Array.from(f.bytes)]))
    expect(asMap(back.files)).toEqual(asMap(readZipProject(original).files))
    expect(dec(back.files.find((f) => f.path === 'main.tex')!.bytes)).toBe(MAIN)
  })

  it('exports the main file at its original path', () => {
    const doc = '\\documentclass{article}\n\\begin{document}\\end{document}\n'
    const plan = planImport(readZipProject(zip({ 'src/thesis.tex': doc, 'figures/a.png': PNG })), NEW)
    expect(plan.main!.from).toBe('src/thesis.tex')
    const entries = projectEntries(plan.main!.source, plan.main!.from, plan.files)
    expect(entries.map((e) => e.path)).toEqual(['src/thesis.tex', 'figures/a.png'])
    expect(projectEntries('x', '../evil.tex', [])[0]!.path).toBe('main.tex')
  })
})
