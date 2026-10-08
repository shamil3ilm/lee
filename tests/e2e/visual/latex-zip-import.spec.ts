import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { onePagePdf } from '../pdf-fixture'

// Visual QA (opt-in with `pnpm e2e:screens`): the "Import LaTeX project"
// review dialog and the editor's top bar (Recompile + logs chip) at phone,
// tablet and desktop, light and dark, with a no-overflow check.

const OUT = path.resolve('.e2e/screens')
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

const DOC = '\\documentclass{article}\n\\usepackage{fontspec}\n\\usepackage[backend=biber]{biblatex}\n\\begin{document}\n\\input{chapters/one}\n\\includegraphics{my figures/chart one}\n\\includegraphics{missing}\n\\end{document}\n'
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function reviewZip(): Buffer {
  return Buffer.from(
    zipSync({
      'thesis/main.tex': strToU8(DOC),
      'thesis/letter.tex': strToU8('\\documentclass{letter}\n\\begin{document}x\\end{document}\n'),
      'thesis/chapters/one.tex': strToU8('Chapter one.\n'),
      'thesis/my figures/chart one.png': PNG,
      'thesis/refs.bib': strToU8('@misc{a, title={A}}\n'),
      'thesis/.latexmkrc': strToU8('$pdf_mode = 5;\n'),
      'thesis/notes.docx': strToU8('x'),
      '__MACOSX/thesis/._main.tex': strToU8('x'),
    }),
  )
}

async function noOverflow(page: Page, width: number): Promise<void> {
  const box = await page.getByRole('dialog').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme} latex zip import`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      test('review dialog and editor top bar', async ({ page }) => {
        await mkdir(OUT, { recursive: true })
        await page.goto('/documents')
        await page.getByRole('button', { name: 'New', exact: true }).click()
        const chooser = page.waitForEvent('filechooser')
        await page.getByRole('menuitem', { name: /Import project \(\.zip\)/ }).click()
        await (await chooser).setFiles({ name: 'thesis.zip', mimeType: 'application/zip', buffer: reviewZip() })
        const dialog = page.getByRole('dialog', { name: 'Import LaTeX project' })
        await expect(dialog.getByTestId('zip-import-tree')).toBeVisible()
        await expect(dialog.getByLabel('Compiler')).toHaveValue('xelatex')
        await dialog.getByText(/^Renamed and rewritten/).click()
        await dialog.getByText(/^Skipped/).click()
        await noOverflow(page, vp.width)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-dialog-latex-zip-review.png`) })
        await page.keyboard.press('Escape')

        await page.route('**/api/documents/*/pdf**', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: onePagePdf() }))
        const href = await page.locator('a[href$="/edit"]').first().getAttribute('href')
        await page.goto(href!)
        await expect(page.locator('.cm-content')).toBeVisible()
        // Under 720 px of workspace the editor shows one pane with Editor / PDF tabs.
        if (vp.width < 1100) await expect(page.getByRole('group', { name: 'Show' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Recompile' })).toBeVisible()
        await expect(page.getByRole('button', { name: /^Logs and errors/ })).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-editor-topbar.png`) })
      })
    })
  }
}
