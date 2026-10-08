import { test, expect } from '@playwright/test'
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
  await expect(dialog).toContainText('compiles as main.tex')
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
