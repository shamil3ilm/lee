import { waitForHydration } from './ready'
import { test, expect, type Page, type Route } from '@playwright/test'
import { onePagePdf } from './pdf-fixture'

// The Overleaf-style LaTeX workspace: compile menu and auto-compile badge,
// autocomplete, compile by shortcut, jump from an error to its line, the
// missing-package hint and fallback, the path-paste banner and import, the
// layout menu, and the in-page pdf.js viewer. The compile service and the
// PDF route are stubbed, so nothing leaves the machine.

const PDF = onePagePdf()

interface CompileRequest {
  source: string
  draft?: boolean
  fresh?: boolean
  settings?: { service: string; engine: string; stopOnError: boolean }
}

async function stubSavedPdf(page: Page): Promise<void> {
  await page.route('**/api/documents/*/pdf**', (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF }))
}

async function openLatexEditor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/documents')
  const href = await page.locator('a[href$="/edit"]').first().getAttribute('href')
  expect(href).toBeTruthy()
  await page.goto(href!)
  await expect(page.locator('.cm-content')).toBeVisible()
}

/** Turn auto compile off through the Recompile menu (deterministic tests). */
async function autoCompileOff(page: Page): Promise<void> {
  const badge = page.getByTestId('auto-compile-badge')
  if (!(await badge.isVisible())) return
  await page.getByRole('button', { name: 'Compile options' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Auto compile/ }).click()
  await expect(badge).toBeHidden()
}

async function fulfillPdf(route: Route, headers: Record<string, string> = {}): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/pdf', headers, body: PDF })
}

test('LaTeX editor: compile menu, auto-compile badge, autocomplete, shortcut compile, jump to error', async ({ page }) => {
  const compiles: CompileRequest[] = []
  let failNext = true
  await stubSavedPdf(page)
  await page.route('**/api/latex/compile', async (route) => {
    compiles.push(route.request().postDataJSON() as CompileRequest)
    if (failNext) {
      failNext = false
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Compile failed',
          log: [
            'pdflatex -interaction nonstopmode -recorder -output-directory latex.out /tmp/downloads/tmp_1/main.tex',
            '/tmp/downloads/tmp_1/main.tex:2: error: Undefined control sequence',
            '      at \\usepackage[margin=0.9in]{geometry}',
            'There were errors; output.pdf not updated',
          ].join('\n'),
        }),
      })
      return
    }
    await fulfillPdf(route)
  })

  await openLatexEditor(page)
  // The saved PDF renders in lee's own viewer, not the browser's.
  await expect(page.getByTestId('pdf-viewer').getByRole('img', { name: 'Page 1' })).toBeVisible()
  await expect(page.getByLabel('Page number')).toHaveValue('1')

  // The Recompile menu: Auto compile is explained and toggles the badge.
  const badge = page.getByTestId('auto-compile-badge')
  await expect(badge).toBeVisible()
  await page.getByRole('button', { name: 'Compile options' }).click()
  const autoItem = page.getByRole('menuitemcheckbox', { name: /Auto compile/ })
  await expect(autoItem).toContainText('Recompiles a moment after you stop typing')
  await expect(page.getByRole('menuitem', { name: /Recompile/ })).toContainText('Ctrl/⌘+Enter')
  await autoItem.click()
  await expect(badge).toBeHidden()

  // Autocomplete: type a partial command, pick it, fill the tab-stop.
  await page.locator('.cm-content').getByText('Designed an idempotent', { exact: false }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('\\subsecti')
  const completions = page.locator('.cm-tooltip-autocomplete')
  await expect(completions).toBeVisible()
  const selected = completions.locator('li[aria-selected="true"]')
  await expect(selected).toContainText('\\subsection')
  await expect(selected).not.toContainText('*')
  // CodeMirror ignores Enter for 75 ms after the list changes.
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Skills')
  await expect(page.locator('.cm-content')).toContainText('\\subsection{Skills}')

  // Compile with Ctrl/Cmd+Enter: the stub fails with a line-2 error.
  await waitForHydration(page)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => compiles.length).toBe(1)
  expect(compiles[0]!.source).toContain('\\subsection{Skills}')
  expect(compiles[0]!.draft).toBe(false)

  // The errors chip counts it; the logs view lists it with file and line.
  await expect(page.getByTestId('problem-count')).toHaveText('1')
  const problems = page.getByRole('region', { name: 'Compile problems' })
  await expect(problems).toBeVisible()
  const problem = problems.getByRole('button', { name: /Undefined control sequence/ })
  await expect(problem).toContainText('main.tex:2')
  // CodeMirror draws lint marks lazily (and may scroll them out of view): assert they exist.
  await expect(page.locator('.cm-lintRange-error').first()).toBeAttached({ timeout: 30_000 })

  // Click the error: the cursor lands on line 2 and the PDF comes back.
  await problem.click()
  await expect(page.locator('.cm-activeLine')).toHaveText('\\usepackage[margin=0.9in]{geometry}')
  await expect(problems).toBeHidden()

  // Fast (draft) mode from the menu + Ctrl/Cmd+S compiles again, successfully.
  await page.getByRole('button', { name: 'Compile options' }).click()
  await page.getByRole('menuitemradio', { name: /Fast \(draft\)/ }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => compiles.length).toBe(2)
  expect(compiles[1]!.draft).toBe(true)
  await expect(page.getByText('Draft preview')).toBeVisible()
  await expect(page.getByTestId('save-state')).toContainText('Saved')

  // Clear cache and recompile skips the server's PDF cache.
  await page.getByRole('button', { name: 'Compile options' }).click()
  await page.getByRole('menuitem', { name: /Clear cache and recompile/ }).click()
  await expect.poll(() => compiles.length).toBe(3)
  expect(compiles[2]!.fresh).toBe(true)
  // Back to Normal mode for later specs.
  await page.getByRole('button', { name: 'Compile options' }).click()
  await page.getByRole('menuitemradio', { name: /^Normal/ }).click()
})

test('LaTeX editor: a package the service lacks → hint, full TeX Live, fallback badge', async ({ page }) => {
  const compiles: CompileRequest[] = []
  await stubSavedPdf(page)
  await page.route('**/api/latex/compile', async (route) => {
    const body = route.request().postDataJSON() as CompileRequest
    compiles.push(body)
    if (body.settings?.service === 'latexonline') {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Compile failed',
          log: "/tmp/downloads/tmp_1/main.tex:3: error: File `fontawesome5.sty' not found\n      at <read *>\n",
          notes: [],
        }),
      })
      return
    }
    const note = "latexonline.cc doesn't have package fontawesome5; compiled on YtoTech (full TeX Live) instead."
    await fulfillPdf(route, { 'x-lee-compile-service': 'ytotech', 'x-lee-compile-notes': encodeURIComponent(JSON.stringify([note])) })
  })

  await openLatexEditor(page)
  await autoCompileOff(page)

  // Primary service only: the missing package fails with a precise hint.
  await page.getByRole('button', { name: 'Compile options' }).click()
  await page.getByRole('menuitemradio', { name: /Primary \(latexonline\.cc\)/ }).click()
  await page.getByRole('button', { name: 'Recompile' }).click()
  await expect.poll(() => compiles.length).toBe(1)
  expect(compiles[0]!.settings).toMatchObject({ service: 'latexonline', engine: 'pdflatex' })
  const problems = page.getByRole('region', { name: 'Compile problems' })
  await expect(problems).toContainText("The compile service doesn't have package fontawesome5.")
  await expect(problems).not.toContainText('Add \\usepackage{fontawesome5}')

  // One click switches to Automatic (full TeX Live fallback).
  await problems.getByRole('button', { name: 'Compile with full TeX Live' }).click()
  await page.getByRole('button', { name: 'Recompile' }).click()
  await expect.poll(() => compiles.length).toBe(2)
  expect(compiles[1]!.settings).toMatchObject({ service: 'auto', engine: 'pdflatex' })
  await expect(problems).toBeHidden()
  await expect(page.getByText('Compiled on YtoTech (full TeX Live)', { exact: true })).toBeVisible()
})

test('LaTeX editor: a pasted file path shows the import banner instead of compiling', async ({ page }) => {
  const compiles: CompileRequest[] = []
  await stubSavedPdf(page)
  await page.route('**/api/latex/compile', async (route) => {
    compiles.push(route.request().postDataJSON() as CompileRequest)
    await fulfillPdf(route)
  })
  await openLatexEditor(page)
  await autoCompileOff(page)

  await page.locator('.cm-content').click()
  await page.locator('.cm-content').evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', '"C:\\Users\\example\\Documents\\resume.tex"')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  const banner = page.getByRole('alert').filter({ hasText: "That's a file path, not LaTeX." })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('resume.tex')
  await expect(page.locator('.cm-content')).not.toContainText('C:\\Users')

  // Import: pick the file; a .tex asks replace or add, replace swaps main.tex.
  const chooser = page.waitForEvent('filechooser')
  await banner.getByRole('button', { name: 'Import file' }).click()
  await (await chooser).setFiles({
    name: 'resume.tex',
    mimeType: 'text/x-tex',
    buffer: Buffer.from('\\documentclass{article}\n\\begin{document}\nImported example\n\\end{document}\n'),
  })
  const dialog = page.getByRole('dialog', { name: /Import resume\.tex/ })
  await dialog.getByRole('button', { name: 'Replace main.tex' }).click()
  await expect(page.locator('.cm-content')).toContainText('Imported example')
  // Put the seeded source back for later specs (undo, then let autosave land).
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.cm-content')).not.toContainText('Imported example')
  await expect(page.locator('.cm-content')).toContainText('\\section*{Experience}')
  await expect(page.getByTestId('save-state')).toContainText('Saved', { timeout: 10_000 })
  expect(compiles).toHaveLength(0)
})

test('LaTeX editor: outline jump, layout menu and resizable split', async ({ page }) => {
  await stubSavedPdf(page)
  await openLatexEditor(page)
  await page.getByRole('navigation', { name: 'Document outline' }).getByRole('button', { name: 'Experience' }).click()
  await expect(page.locator('.cm-activeLine')).toHaveText('\\section*{Experience}')

  // Layout: PDF only hides the editor; the edge button brings it back.
  await page.getByRole('button', { name: 'Layout' }).click()
  await page.getByRole('menuitemradio', { name: /PDF only/ }).click()
  await expect(page.locator('.cm-content')).toBeHidden()
  await page.getByRole('button', { name: 'Show the editor' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()

  // The split handle resizes with the keyboard.
  const handle = page.getByRole('separator', { name: 'Resize the editor and PDF' })
  const before = Number(await handle.getAttribute('aria-valuenow'))
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before)
  await page.keyboard.press('ArrowLeft')
})

test('LaTeX editor: new file opens in a tab, search finds it, delete removes it', async ({ page }) => {
  await stubSavedPdf(page)
  await openLatexEditor(page)
  const files = page.getByRole('region', { name: 'Files' })
  await files.getByRole('button', { name: 'New file' }).click()
  await page.getByLabel('New file name').fill('extra-notes.tex')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: /extra-notes\.tex/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.cm-content')).toContainText('% extra-notes.tex')

  // Find in project searches main.tex and the open file.
  await page.getByRole('button', { name: 'Search in project' }).click()
  await page.getByLabel('Find in project').fill('extra-notes')
  await expect(page.getByRole('button', { name: /extra-notes\.tex:1/ })).toBeVisible()

  await page.getByRole('button', { name: 'Files and outline' }).click()
  await files.getByRole('button', { name: 'Delete extra-notes.tex' }).click()
  await page.getByRole('dialog', { name: /Delete extra-notes\.tex/ }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('tab', { name: /extra-notes\.tex/ })).toBeHidden()
  await expect(page.getByRole('tab', { name: 'main.tex' })).toHaveAttribute('aria-selected', 'true')
})
