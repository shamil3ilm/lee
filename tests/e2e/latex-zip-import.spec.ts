import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { strToU8, unzipSync, zipSync } from 'fflate'

// Import a LaTeX project .zip (an Overleaf-style export): review it, import
// it into a new document, compile it (server side, against the e2e compile
// stub, tests/e2e/latex-stub.mjs), then download it back as a .zip with the
// same folder layout.

const MAIN = String.raw`\documentclass{article}
\usepackage{graphicx}
\graphicspath{{figures/}}
\begin{document}
\input{sections/intro}
\includegraphics[width=2cm]{logo}
\includegraphics{missing-chart}
\cite{knuth}
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`
const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
)
const FILES: Record<string, Uint8Array> = {
  'main.tex': strToU8(MAIN),
  'sections/intro.tex': strToU8('Hello from the introduction.\n'),
  'figures/logo.png': PNG,
  'refs.bib': strToU8('@book{knuth, author={Donald Knuth}, title={The TeXbook}, year={1984}}\n'),
}

function overleafZip(): Buffer {
  return Buffer.from(zipSync({ ...FILES, '__MACOSX/._main.tex': strToU8('junk'), 'notes.docx': strToU8('x') }))
}

test('LaTeX project zip: review, import, compile and export round trip', async ({ page }) => {
  const compiles: number[] = []
  page.on('response', (res) => {
    if (res.url().endsWith('/api/latex/compile')) compiles.push(res.status())
  })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/documents')

  // New › Import project (.zip) opens the picker.
  await page.getByRole('button', { name: 'New', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: /Import project \(\.zip\)/ }).click()
  await (await chooser).setFiles({ name: 'thesis-project.zip', mimeType: 'application/zip', buffer: overleafZip() })

  // The review: tree, main file, compiler, warnings, skipped files.
  const dialog = page.getByRole('dialog', { name: 'Import LaTeX project' })
  await expect(dialog).toBeVisible()
  const tree = dialog.getByTestId('zip-import-tree')
  for (const name of ['main.tex', 'figures/', 'logo.png', 'sections/', 'intro.tex', 'refs.bib']) {
    await expect(tree.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(dialog).toContainText('Compiles as main.tex')
  await expect(dialog.getByLabel('Compiler')).toHaveValue('pdflatex')
  await expect(dialog).toContainText('\\includegraphics{missing-chart} in main.tex, line 7: no such file in the project')
  await expect(dialog).toContainText('1 unsupported file will not be imported.')
  await dialog.getByText(/^Skipped \(\d+\)$/).click()
  await expect(dialog).toContainText('Unsupported file type (.docx)')

  await dialog.getByRole('button', { name: 'Import 4 files' }).click()

  // The editor opens on the imported project and compiles once.
  await page.waitForURL(/\/documents\/[0-9a-f-]{36}\/edit/)
  const docId = /documents\/([0-9a-f-]{36})\/edit/.exec(page.url())![1]!
  await expect(page.locator('.cm-content')).toContainText('\\input{sections/intro}')
  await expect.poll(() => compiles.filter((s) => s === 200).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1)
  await expect(page.getByTestId('pdf-viewer').getByRole('img', { name: 'Page 1' })).toBeVisible()

  // The file tree keeps the folders; the missing file is a clickable warning.
  const files = page.getByRole('list', { name: 'Project files' })
  await expect(files.getByRole('button', { name: 'sections', exact: true })).toBeVisible()
  await expect(files.getByRole('button', { name: 'figures/logo.png', exact: true })).toBeVisible()
  const report = page.getByTestId('import-report')
  await expect(report).toContainText('missing-chart')
  await report.getByRole('button', { name: 'main.tex:7' }).click()
  await expect(page.locator('.cm-activeLine')).toHaveText('\\includegraphics{missing-chart}')

  // A text file in a folder opens in a tab.
  await files.getByRole('button', { name: 'sections/intro.tex', exact: true }).click()
  await expect(page.locator('.cm-content')).toContainText('Hello from the introduction.')

  // Download project (.zip): same paths, same bytes.
  await page.getByRole('button', { name: 'More document actions' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download project (.zip)' }).click()
  const zipPath = await (await download).path()
  const back = unzipSync(new Uint8Array(await readFile(zipPath!)))
  expect(Object.keys(back).sort()).toEqual(Object.keys(FILES).sort())
  for (const [path, bytes] of Object.entries(FILES)) expect(Buffer.from(back[path]!).equals(Buffer.from(bytes))).toBe(true)

  // Leave the seeded document list as it was for other specs.
  expect((await page.request.delete(`/api/documents/${docId}`)).ok()).toBe(true)
})

test('LaTeX project zip: a zip-slip archive is refused before anything is stored', async ({ page }) => {
  await page.goto('/documents')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: /Import project \(\.zip\)/ }).click()
  const evil = Buffer.from(zipSync({ 'main.tex': strToU8(MAIN), '../evil.tex': strToU8('x') }))
  await (await chooser).setFiles({ name: 'evil.zip', mimeType: 'application/zip', buffer: evil })
  const dialog = page.getByRole('dialog', { name: 'Import LaTeX project' })
  await expect(dialog.getByRole('alert')).toContainText('unsafe path')
  await expect(dialog.getByRole('button', { name: /^Import/ })).toBeDisabled()
})

/** Import a zip from the Documents page; returns the new document's id. */
async function importAsNewDocument(page: Page, zip: Buffer, name: string): Promise<string> {
  await page.goto('/documents')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: /Import project \(\.zip\)/ }).click()
  await (await chooser).setFiles({ name, mimeType: 'application/zip', buffer: zip })
  await page.getByTestId('zip-import-confirm').click()
  await page.waitForURL(/\/documents\/[0-9a-f-]{36}\/edit/)
  await expect(page.locator('.cm-content')).toBeVisible()
  return /documents\/([0-9a-f-]{36})\/edit/.exec(page.url())![1]!
}

/** Drop files on an element, as a browser drag-and-drop would. */
async function dropFiles(page: Page, selector: string, files: { name: string; bytes: number[] }[]): Promise<void> {
  await page.locator(selector).evaluate((el, list) => {
    const data = new DataTransfer()
    for (const f of list) data.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: 'application/zip' }))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, files)
}

test('LaTeX project zip: add files by dropping on the file tree, then replace the project', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  const docId = await importAsNewDocument(page, Buffer.from(zipSync(FILES)), 'base.zip')
  const files = page.getByRole('list', { name: 'Project files' })
  await expect(files.getByRole('button', { name: 'sections/intro.tex', exact: true })).toBeVisible()

  // Drop a zip on the file tree: "Add files" skips names already here.
  const extra = zipSync({ 'appendix/a.tex': strToU8('Appendix A.\n'), 'figures/logo.png': PNG })
  await dropFiles(page, 'section[aria-label="Files"]', [{ name: 'extra.zip', bytes: Array.from(extra) }])
  const dialog = page.getByRole('dialog', { name: 'Import LaTeX project' })
  await dialog.getByLabel(/Add files/).check()
  await dialog.getByText(/^Skipped \(\d+\)$/).click()
  await expect(dialog).toContainText('Already in this document')
  await dialog.getByRole('button', { name: 'Add 1 file' }).click()
  await expect(files.getByRole('button', { name: 'appendix/a.tex', exact: true })).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('\\input{sections/intro}')

  // More › Import project (.zip) › Replace project: files and main.tex replaced.
  const replacement = zipSync({
    'cv.tex': strToU8(String.raw`\documentclass{article}
\usepackage{fontspec}
\begin{document}
Replaced \input{parts/one}
\end{document}
`),
    'parts/one.tex': strToU8('One.\n'),
  })
  await page.getByRole('button', { name: 'More document actions' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: /Import project \(\.zip\)/ }).click()
  await (await chooser).setFiles({ name: 'replacement.zip', mimeType: 'application/zip', buffer: Buffer.from(replacement) })
  await expect(dialog.getByLabel('Compiler')).toHaveValue('xelatex')
  await expect(dialog).toContainText('fontspec')
  const compile = page.waitForRequest((r) => r.url().endsWith('/api/latex/compile'))
  await dialog.getByRole('button', { name: 'Replace with 2 files' }).click()
  await expect(page.locator('.cm-content')).toContainText('Replaced')
  await expect(files.getByRole('button', { name: 'parts/one.tex', exact: true })).toBeVisible()
  await expect(files.getByRole('button', { name: 'appendix/a.tex', exact: true })).toBeHidden()
  expect(((await compile).postDataJSON() as { settings: { engine: string } }).settings.engine).toBe('xelatex')

  expect((await page.request.delete(`/api/documents/${docId}`)).ok()).toBe(true)
})

test('LaTeX editor on a phone: Recompile and the logs chip are in the top bar', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  const docId = await importAsNewDocument(page, Buffer.from(zipSync(FILES)), 'phone.zip')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/documents/${docId}/edit`)
  await expect(page.locator('.cm-content')).toBeVisible()
  const bar = page.getByRole('button', { name: 'Recompile' })
  await expect(bar).toBeVisible()
  await expect(page.getByRole('button', { name: /^Logs and errors/ })).toBeVisible()
  // Compiling from the Editor view shows the PDF when it succeeds.
  await bar.click()
  await expect(page.getByTestId('pdf-viewer').getByRole('img', { name: 'Page 1' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.cm-content')).toBeHidden()
  expect((await page.request.delete(`/api/documents/${docId}`)).ok()).toBe(true)
})
