import { test, expect, type Page } from '@playwright/test'

// v17 §8.5 — the CodeMirror LaTeX editor: autocomplete, compile by keyboard
// shortcut, and jump from a compile error to its line. The compile service
// and the PDF route are stubbed, so nothing leaves the machine and the
// seeded document is never modified.

const MINIMAL_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

interface CompileRequest {
  source: string
  draft?: boolean
}

async function openLatexEditor(page: Page): Promise<void> {
  await page.goto('/documents')
  const href = await page.locator('a[href$="/edit"]').first().getAttribute('href')
  expect(href).toBeTruthy()
  await page.goto(href!)
  await expect(page.locator('.cm-content')).toBeVisible()
}

test('LaTeX editor: autocomplete, compile via shortcut, jump to error', async ({ page }) => {
  const compiles: CompileRequest[] = []
  let failNext = true
  await page.route('**/api/documents/*/pdf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: MINIMAL_PDF }),
  )
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
    await route.fulfill({ status: 200, contentType: 'application/pdf', body: MINIMAL_PDF })
  })

  await openLatexEditor(page)

  // Keep the test deterministic: only the shortcuts compile.
  const auto = page.getByRole('button', { name: 'Auto-compile' })
  await auto.click()
  await expect(auto).toHaveAttribute('aria-pressed', 'false')

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
  // CodeMirror ignores Enter for 75 ms after the list changes (its
  // interactionDelay, so fast typists don't accept by accident).
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Skills')
  await expect(page.locator('.cm-content')).toContainText('\\subsection{Skills}')

  // Compile with Ctrl/Cmd+Enter: the stub fails with a line-2 error.
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => compiles.length).toBe(1)
  expect(compiles[0]!.source).toContain('\\subsection{Skills}')
  expect(compiles[0]!.draft).toBe(false)

  const problems = page.getByRole('region', { name: 'Compile problems' })
  await expect(problems).toBeVisible()
  const problem = problems.getByRole('button', { name: /Undefined control sequence/ })
  await expect(problem).toContainText('main.tex:2')
  // The error is also marked in the editor as a diagnostic.
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible()

  // Jump to the error: the cursor lands on line 2.
  await problem.click()
  await expect(page.locator('.cm-activeLine')).toHaveText('\\usepackage[margin=0.9in]{geometry}')

  // Draft mode + Ctrl/Cmd+S compiles again, now successfully.
  await page.getByRole('button', { name: 'Draft' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => compiles.length).toBe(2)
  expect(compiles[1]!.draft).toBe(true)
  await expect(problems).toBeHidden()
  await expect(page.getByText('Draft preview')).toBeVisible()
})

test('LaTeX editor: a package the service lacks → hint, full TeX Live, fallback badge', async ({ page }) => {
  const compiles: (CompileRequest & { settings?: { service: string; engine: string } })[] = []
  await page.route('**/api/documents/*/pdf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: MINIMAL_PDF }),
  )
  await page.route('**/api/latex/compile', async (route) => {
    const body = route.request().postDataJSON() as (typeof compiles)[number]
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
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: { 'x-lee-compile-service': 'ytotech', 'x-lee-compile-notes': encodeURIComponent(JSON.stringify([note])) },
      body: MINIMAL_PDF,
    })
  })

  await openLatexEditor(page)
  const auto = page.getByRole('button', { name: 'Auto-compile' })
  if ((await auto.getAttribute('aria-pressed')) === 'true') await auto.click()

  // latexonline.cc only: the missing package fails with a precise hint.
  await page.getByLabel('Compiler').selectOption('latexonline')
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => compiles.length).toBe(1)
  expect(compiles[0]!.settings).toEqual({ service: 'latexonline', engine: 'pdflatex' })
  const problems = page.getByRole('region', { name: 'Compile problems' })
  await expect(problems).toContainText("The compile service doesn't have package fontawesome5.")
  await expect(problems).not.toContainText('Add \\usepackage{fontawesome5}')

  // One click switches to Auto (full TeX Live fallback) and compiles there.
  await problems.getByRole('button', { name: 'Compile with full TeX Live' }).click()
  await expect(page.getByLabel('Compiler')).toHaveValue('auto')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => compiles.length).toBe(2)
  expect(compiles[1]!.settings).toEqual({ service: 'auto', engine: 'pdflatex' })
  await expect(problems).toBeHidden()
  await expect(page.getByText('Compiled on YtoTech (full TeX Live)')).toBeVisible()
})

test('LaTeX editor: outline lists sections and jumps to them', async ({ page }) => {
  await page.route('**/api/documents/*/pdf**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: MINIMAL_PDF }),
  )
  await openLatexEditor(page)
  await page.getByRole('button', { name: 'Outline' }).click()
  const outline = page.getByRole('navigation', { name: 'Document outline' }).first()
  await outline.getByRole('button', { name: 'Experience' }).click()
  await expect(page.locator('.cm-activeLine')).toHaveText('\\section*{Experience}')
})
