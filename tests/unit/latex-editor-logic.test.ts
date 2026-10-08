import { describe, expect, it } from 'vitest'
import { looksLikeFilePath, pathFileName } from '@/lib/latex/path-paste'
import { extractLatexHint } from '@/lib/latex/errors'
import { fileKind, isTextFile, mimeForFile, validateNewFileName } from '@/lib/latex/file-kinds'
import { clampPage, scaleFor, zoomIn, zoomLabel, zoomOut } from '@/lib/latex/pdf-zoom'
import { applyToolbarCommand } from '@/lib/latex/editor-commands'
import { MAX_HITS, searchProject } from '@/lib/latex/project-search'
import {
  compiledLabel,
  DEFAULT_EDITOR_PREFS,
  parseEditorPrefs,
  stepFontSize,
  workspaceSize,
} from '@/lib/latex/editor-prefs'

describe('path-paste detection', () => {
  it.each([
    'C:\\Users\\example\\Documents\\resume.tex',
    '"C:\\Users\\example\\My Files\\resume.tex"',
    "'D:/cv/resume.tex'",
    '\\\\server\\share\\cv.tex',
    '/home/example/cv/resume.tex',
    '~/cv/resume.tex',
    'file:///C:/Users/example/resume.tex',
  ])('flags %s', (text) => {
    expect(looksLikeFilePath(text)).toBe(true)
  })

  it.each([
    '\\documentclass{article}\n\\begin{document}C:\\Users\\x\\end{document}',
    'Hello world',
    '\\input{chapter1.tex}',
    '',
    'see /usr/share/texlive for fonts',
  ])('leaves %j alone', (text) => {
    expect(looksLikeFilePath(text)).toBe(false)
  })

  it('names the file at the end of the path', () => {
    expect(pathFileName('"C:\\Users\\example\\resume.tex"')).toBe('resume.tex')
    expect(pathFileName('/tmp/cv.tex')).toBe('cv.tex')
  })

  it('replaces the "\\Users is undefined" suggestion with an import hint', () => {
    const source = '"C:\\Users\\example\\resume.tex"'
    const log = 'main.tex:1: error: Undefined control sequence\n      at "C:\\Users\n'
    const hint = extractLatexHint(log, source)
    expect(hint).toMatchObject({ kind: 'file_path', subject: 'resume.tex', actions: ['import_file'] })
    expect(hint?.message).toContain("That's a file path, not LaTeX.")
    expect(hint?.message).not.toContain('\\usepackage')
  })
})

describe('file kinds', () => {
  it('classifies project files', () => {
    expect(fileKind('main.tex')).toBe('tex')
    expect(fileKind('refs.BIB')).toBe('bib')
    expect(fileKind('photo.jpeg')).toBe('image')
    expect(fileKind('cover.pdf')).toBe('pdf')
    // Project text files (from a .zip import) open in the editor too.
    expect(fileKind('notes.txt')).toBe('text')
    expect(isTextFile('notes.txt')).toBe(true)
    expect(fileKind('plainnat.bst')).toBe('sty')
    expect(fileKind('notes.docx')).toBe('other')
    expect(isTextFile('awesome-cv.cls')).toBe(true)
    expect(isTextFile('photo.png')).toBe(false)
  })

  it('gives text uploads a MIME type when the browser leaves it empty', () => {
    expect(mimeForFile('refs.bib', '')).toBe('text/x-bibtex')
    expect(mimeForFile('ch1.tex', '')).toBe('text/x-tex')
    expect(mimeForFile('photo.png', 'image/png')).toBe('image/png')
  })

  it('validates new file names', () => {
    expect(validateNewFileName('chapter1.tex', [])).toBeNull()
    expect(validateNewFileName('main.tex', [])).toMatch(/already exists/)
    expect(validateNewFileName('refs.bib', ['refs.bib'])).toMatch(/already exists/)
    expect(validateNewFileName('../evil.tex', [])).toMatch(/Use letters/)
    expect(validateNewFileName('notes.txt', [])).toMatch(/ending in/)
  })
})

describe('PDF zoom', () => {
  const page = { width: 612, height: 792 }

  it('steps through the zoom scale', () => {
    expect(zoomIn(1)).toBe(1.1)
    expect(zoomOut(1)).toBe(0.9)
    expect(zoomIn(2)).toBe(2.5)
    expect(zoomOut(0.5)).toBe(0.4)
    expect(zoomLabel(1.25)).toBe('125%')
  })

  it('fits the page width or the whole page into the pane', () => {
    expect(scaleFor('fit-width', { width: 644, height: 400 }, page)).toBeCloseTo(1, 5)
    expect(scaleFor('fit-page', { width: 644, height: 428 }, page)).toBeCloseTo(0.5, 5)
    expect(scaleFor(1.5, { width: 10, height: 10 }, page)).toBe(1.5)
    expect(scaleFor('fit-width', { width: 0, height: 0 }, page)).toBe(1)
  })

  it('clamps a typed page number', () => {
    expect(clampPage(5, 1, 2)).toBe(2)
    expect(clampPage(0, 1, 2)).toBe(1)
    expect(clampPage(Number.NaN, 2, 3)).toBe(2)
  })
})

describe('toolbar commands', () => {
  it('wraps the selection in \\textbf', () => {
    const doc = 'say hello there'
    const edit = applyToolbarCommand('bold', doc, 4, 9)
    expect(edit).toMatchObject({ from: 4, to: 9, insert: '\\textbf{hello}' })
    expect(edit.anchor).toBe(12)
    expect(edit.head).toBe(17)
  })

  it('inserts a placeholder and selects it when nothing is selected', () => {
    const edit = applyToolbarCommand('italic', 'x', 1, 1)
    expect(edit.insert).toBe('\\textit{italic text}')
    expect([edit.anchor, edit.head]).toEqual([1 + '\\textit{'.length, 1 + '\\textit{italic text'.length])
  })

  it('starts block commands on their own line and selects the placeholder', () => {
    const edit = applyToolbarCommand('section', 'abc', 3, 3)
    expect(edit.insert).toBe('\n\\section{Title}\n')
    expect(edit.insert.slice(edit.anchor - 3, edit.head - 3)).toBe('Title')
    const list = applyToolbarCommand('itemize', '', 0, 0)
    expect(list.insert).toBe('\\begin{itemize}\n  \\item Item\n\\end{itemize}\n')
  })

  it('turns a selected URL into a link', () => {
    const doc = 'https://example.dev'
    expect(applyToolbarCommand('link', doc, 0, doc.length).insert).toBe('\\href{https://example.dev}{https://example.dev}')
    expect(applyToolbarCommand('link', 'my site', 0, 7).insert).toBe('\\href{https://}{my site}')
  })
})

describe('editor prefs', () => {
  it('falls back to defaults for missing or corrupt values', () => {
    expect(parseEditorPrefs(null)).toEqual(DEFAULT_EDITOR_PREFS)
    expect(parseEditorPrefs('{not json')).toEqual(DEFAULT_EDITOR_PREFS)
  })

  it('clamps sizes and rejects unknown values', () => {
    const p = parseEditorPrefs(
      JSON.stringify({ layout: 'weird', sideWidth: 9999, editorFraction: 0.01, fontSize: 99, sidePanel: null, darkPdf: true }),
    )
    expect(p).toMatchObject({ layout: 'split', sideWidth: 420, editorFraction: 0.2, fontSize: 13, sidePanel: null, darkPdf: true })
  })

  it('steps the font size within the scale', () => {
    expect(stepFontSize(13, 1)).toBe(14)
    expect(stepFontSize(18, 1)).toBe(18)
    expect(stepFontSize(11, -1)).toBe(11)
  })

  it('maps container widths to layouts', () => {
    expect(workspaceSize(1400)).toBe('wide')
    expect(workspaceSize(900)).toBe('medium')
    expect(workspaceSize(500)).toBe('narrow')
  })

  it('formats the last compile in US time', () => {
    expect(compiledLabel(new Date(2026, 9, 7, 14, 41), 1830)).toBe('Compiled 2:41 PM · 1.8 s')
  })
})

describe('find in project', () => {
  const files = [
    { name: 'main.tex', text: '\\section{Experience}\nBuilt payouts.\nPayouts again' },
    { name: 'ch1.tex', text: 'more payouts here' },
  ]

  it('finds every match across files, case-insensitively by default', () => {
    const hits = searchProject(files, 'payouts')
    expect(hits.map((h) => `${h.file}:${h.line}:${h.column}`)).toEqual(['main.tex:2:6', 'main.tex:3:0', 'ch1.tex:1:5'])
    expect(hits[0]!.preview.slice(hits[0]!.start, hits[0]!.end)).toBe('payouts')
  })

  it('honours match case and an empty query', () => {
    expect(searchProject(files, 'Payouts', { caseSensitive: true })).toHaveLength(1)
    expect(searchProject(files, '')).toEqual([])
  })

  it('caps the number of hits', () => {
    expect(searchProject([{ name: 'a.tex', text: 'x'.repeat(500) }], 'x')).toHaveLength(MAX_HITS)
  })
})
