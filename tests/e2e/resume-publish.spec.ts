import { test, expect, type Page } from '@playwright/test'
import { E2E_GITHUB_STUB_URL, E2E_LATEX_STUB_URL } from './env'

// Master profile → variant → publish, end to end. The seeded legacy master
// CV is migrated into the master profile on first visit; Publish talks to
// tests/e2e/github-stub.mjs (GITHUB_API_URL), never to GitHub.

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

async function latexStats(page: Page): Promise<{ compiles: number }> {
  const res = await page.request.get(`${E2E_LATEX_STUB_URL}/__test/stats`)
  return (await res.json()) as { compiles: number }
}

async function setLatexMode(page: Page, mode: 'ok' | 'fail' | 'down'): Promise<void> {
  const res = await page.request.post(`${E2E_LATEX_STUB_URL}/__test/mode?mode=${mode}`)
  expect(res.ok()).toBe(true)
}

async function stubFile(page: Page, path = 'profile.json'): Promise<{ text: string | null; commits: number }> {
  const res = await page.request.get(`${E2E_GITHUB_STUB_URL}/__test/file?path=${encodeURIComponent(path)}`)
  return (await res.json()) as { text: string | null; commits: number }
}

/** A synthetic 240×180 PNG drawn in the browser (no real photo). */
async function syntheticPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 240
    c.height = 180
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#1a2b4c'
    ctx.fillRect(0, 0, 240, 180)
    ctx.fillStyle = '#f2c14e'
    ctx.beginPath()
    ctx.arc(120, 90, 60, 0, Math.PI * 2)
    ctx.fill()
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.split(',')[1]!, 'base64')
}

test('edit the master profile, build a variant, preview it and publish to the portfolio', async ({ page }) => {
  // 1. Résumé: the legacy master CV arrives as the master profile.
  await page.goto('/settings/resume')
  await expect(page.getByRole('heading', { name: 'Résumé', level: 1 })).toBeVisible()
  await expect(page.locator('#basics-name')).toHaveValue('Asha Menon')
  await page.locator('#basics-url').fill('https://asha.example.dev')
  await page.getByLabel('Education 1 area').fill('Computer Science')
  await page.locator('#pf-canonical').fill('https://asha.example.dev/profile.json')
  await page.locator('#qv-role').fill('Backend Engineer')
  await page.locator('#qv-line').fill('Payments and ledgers in Go.')
  await page.locator('#qv-skills').fill('Go, PostgreSQL')
  await page.getByRole('button', { name: 'Add result' }).click()

  // A wording that changes a number is refused; a fact-locked one is kept.
  const wording = page.getByLabel('New wording').first()
  await wording.fill('Idempotent payouts API in Go: 5M requests per day')
  await expect(page.getByText('Numbers not in the original: 5m').first()).toBeVisible()
  await wording.fill('Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await page.getByRole('button', { name: 'Save profile' }).first().click()
  await expectToast(page, /Profile saved/)

  // 2. Variant: GCC × Backend, preview, pick the wording, save a version.
  await page.goto('/settings/variants')
  await page.getByLabel('Region').selectOption('gcc')
  // Role presets come from accepted role families; other specs may have
  // cleared them, so use Backend when offered and General otherwise.
  const role = page.getByLabel('Role')
  const offered = await role.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
  await role.selectOption(offered.includes('backend') ? 'backend' : '')
  await page.getByRole('button', { name: 'Create variant' }).click()
  await page.waitForURL(/\/settings\/variants\/[0-9a-f-]{36}$/)
  const variantUrl = page.url()
  const preview = page.getByTestId('variant-preview')
  await expect(preview.getByRole('heading', { name: 'Asha Menon' })).toBeVisible()
  await expect(preview).toContainText('Add your Arabic level')
  // GCC: the photo is off by default; on without an uploaded photo, lee says so.
  const photoField = page.getByLabel('Photo', { exact: true })
  await expect(photoField).not.toBeChecked()
  await photoField.check()
  await expect(preview).toContainText('no profile photo is uploaded')
  await page.getByLabel(/^Wording for: Designed an idempotent payouts/).selectOption({ label: 'Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability' })
  await expect(preview).toContainText('Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability')
  // The Classic template is offered next to ATS-plain and Designed, and saved.
  await page.getByLabel('Template').selectOption('classic')
  await page.getByRole('button', { name: 'Save variant' }).click()
  await expectToast(page, 'Saved as version 2')
  await expect(page.getByLabel('Plain-text résumé')).toHaveValue(/ASHA MENON/)
  await page.reload()
  await expect(page.getByLabel('Template')).toHaveValue('classic')

  // Make PDF: the Classic LaTeX is written and compiled through the PDF
  // route against the compile-service stub (tests/e2e/latex-stub.mjs).
  const before = await latexStats(page)
  await page.getByRole('button', { name: 'Make PDF' }).click()
  const pdfStatus = page.getByTestId('variant-pdf-status')
  await expect(pdfStatus).toHaveAttribute('data-phase', 'ready', { timeout: 30_000 })
  await expect(pdfStatus).toContainText('PDF ready')
  expect((await latexStats(page)).compiles).toBe(before.compiles + 1)
  const pdfHref = await pdfStatus.getByRole('link', { name: 'Download PDF' }).getAttribute('href')
  const pdfRes = await page.request.get(pdfHref!)
  expect(pdfRes.status()).toBe(200)
  expect(pdfRes.headers()['content-type']).toContain('application/pdf')
  expect((await pdfRes.body()).subarray(0, 5).toString()).toBe('%PDF-')
  // The second view is served from the PDF cache: no new compile.
  expect((await latexStats(page)).compiles).toBe(before.compiles + 1)
  await pdfStatus.getByRole('link', { name: 'Open in the LaTeX editor' }).click()
  // CodeMirror renders only the lines in view: check the top of the file.
  await expect(page.locator('.cm-content')).toContainText('(Classic layout)')
  await expect(page.locator('.cm-content')).toContainText('\documentclass[10pt, letterpaper]{article}')

  // 3. Publish: repository, token (checked against the stub), preview, publish.
  await page.goto('/settings/publish')
  const repo = page.getByRole('form', { name: 'Portfolio repository' })
  await repo.getByLabel(/Repository/).fill('example-asha/portfolio')
  await repo.getByRole('button', { name: 'Save' }).click()
  await expectToast(page, 'Repository saved')
  await page.getByLabel('GitHub token').fill('github_pat_e2e_synthetic_token_0000000000')
  await page.getByRole('button', { name: 'Save', exact: true }).nth(1).click()
  await expectToast(page, 'Token saved')
  await expect(page.getByRole('list', { name: 'Token check' })).toContainText('Contents: read')

  await page.reload()
  await expect(page.getByText('Passes the portfolio build’s checks.')).toBeVisible()
  await page.getByText('Show profile.json').click()
  await expect(page.getByTestId('preview-json')).toContainText('"name": "Asha Menon"')
  await expect(page.getByTestId('preview-json')).not.toContainText('+91 90000 00000')

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  // Durable state, not the transient toast: CI runners can take longer than a toast stays up.
  await expect(page.getByTestId('publish-status')).toContainText('1.0.0', { timeout: 30_000 })
  await expect(page.getByTestId('publish-status')).toContainText('Published')
  await expect(page.getByTestId('publish-status').getByRole('link', { name: 'view commit' })).toBeVisible()
  let file = await stubFile(page)
  expect(file.commits).toBe(1)
  expect(file.text).toContain('"canonical": "https://asha.example.dev/profile.json"')
  expect(file.text).not.toContain('+91 90000 00000')

  // 4. A hand edit on GitHub is never overwritten silently.
  const edited = file.text!.replace('"label": "Senior Backend Engineer"', '"label": "Backend Engineer (edited on GitHub)"')
  await page.request.post(`${E2E_GITHUB_STUB_URL}/__test/edit`, { data: edited, headers: { 'content-type': 'text/plain' } })
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  const conflict = page.getByRole('region', { name: 'Changes in the repository' })
  await expect(conflict).toContainText('edited outside lee')
  await expect(conflict).toContainText('Backend Engineer (edited on GitHub)')
  await conflict.getByRole('group', { name: 'Basics' }).getByLabel('Take the repo’s').check()
  await conflict.getByRole('button', { name: 'Publish with these choices' }).click()
  // Taking the repo's basics makes lee match the file: nothing left to commit.
  await expectToast(page, 'Already up to date')
  file = await stubFile(page)
  expect(file.commits).toBe(1)
  // …and the hand edit is now a lee fact, so the next publish keeps it.
  await page.goto('/settings/resume')
  await expect(page.locator('#basics-label')).toHaveValue('Backend Engineer (edited on GitHub)')
  await page.locator('#basics-label').fill('Payments Backend Engineer')
  await page.getByRole('button', { name: 'Save profile' }).first().click()
  await expectToast(page, /Profile saved/)
  await page.goto('/settings/publish')
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByTestId('publish-status')).toContainText('1.0.1', { timeout: 30_000 })
  file = await stubFile(page)
  expect(file.commits).toBe(2)
  expect(file.text).toContain('"label": "Payments Backend Engineer"')

  // 5. Photo: uploaded on Résumé (cropped in the browser), private, used by the GCC variant.
  await page.goto('/settings/resume')
  await page.getByTestId('photo-input').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await syntheticPng(page) })
  // The crop + upload can be slow on CI; wait for the stored photo, not the toast.
  await expect(page.getByTestId('profile-photo')).toBeVisible({ timeout: 30_000 })
  const stored = await page.request.get('/api/profile/photo')
  expect(stored.headers()['content-type']).toBe('image/jpeg')
  expect(stored.headers()['cache-control']).toContain('private')
  await page.goto(variantUrl)
  await expect(page.getByLabel('Photo', { exact: true })).toBeChecked()
  await expect(page.getByTestId('variant-preview')).not.toContainText('no profile photo is uploaded')

  // 6. Variant page on the portfolio: off by default; on → variants/<slug>.json.
  const toggle = page.getByLabel(/Publish this variant to the portfolio too/)
  await expect(toggle).not.toBeChecked()
  await toggle.check()
  await page.getByLabel('Page address').fill('gcc-backend')
  await expect(page.getByText('https://asha.example.dev/resume/gcc-backend.html')).toBeVisible()
  await page.getByRole('button', { name: 'Save variant' }).click()
  await expectToast(page, /Saved/)

  await page.goto('/settings/publish')
  const row = page.getByTestId('variant-publish-gcc-backend')
  await row.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, /Published .* \(1\.0\.0\)/)
  await expect(row.getByTestId('variant-page-url')).toHaveAttribute('href', 'https://asha.example.dev/resume/gcc-backend.html')
  const variantFile = await stubFile(page, 'variants/gcc-backend.json')
  expect(variantFile.commits).toBe(3)
  expect(variantFile.text).toContain('"canonical": "https://asha.example.dev/variants/gcc-backend.json"')
  expect(variantFile.text).toContain('Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability')
  expect(variantFile.text).not.toContain('+91 90000 00000')
  expect(variantFile.text).not.toContain('lee-photo')
  // profile.json is untouched by a variant publish.
  expect((await stubFile(page)).text).toBe(file.text)

  await page.goto(variantUrl)
  await expect(page.getByTestId('variant-public-url')).toHaveAttribute('href', 'https://asha.example.dev/resume/gcc-backend.html')
  await expect(page.getByLabel('Page address')).toBeDisabled()

  // 7. Unpublish asks first, then deletes the file through the contents API.
  await page.goto('/settings/publish')
  await row.getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('dialog')).toContainText('deletes variants/gcc-backend.json')
  await page.getByRole('dialog').getByRole('button', { name: 'Unpublish' }).click()
  await expectToast(page, 'Removed variants/gcc-backend.json')
  expect((await stubFile(page, 'variants/gcc-backend.json')).text).toBeNull()
  await page.goto(variantUrl)
  await expect(page.getByLabel(/Publish this variant to the portfolio too/)).not.toBeChecked()
})

test('Make PDF reports a compile-service outage with Try again, then makes the PDF', async ({ page }) => {
  await page.goto('/settings/variants')
  await page.getByRole('link', { name: /India · Backend/ }).first().click()
  await page.waitForURL(/\/settings\/variants\/[0-9a-f-]{36}$/)
  try {
    await setLatexMode(page, 'down')
    await page.getByRole('button', { name: 'Make PDF' }).click()
    const status = page.getByTestId('variant-pdf-status')
    // Both services down: the PDF route answers 503 and the panel says so.
    await expect(status).toHaveAttribute('data-phase', 'failed', { timeout: 30_000 })
    await expect(status).toContainText('The compile service is not answering right now')
    await expect(page.getByRole('button', { name: 'Make PDF' })).toBeEnabled()

    await setLatexMode(page, 'ok')
    await status.getByRole('button', { name: 'Try again' }).click()
    await expect(status).toHaveAttribute('data-phase', 'ready', { timeout: 30_000 })
    await expect(status.getByRole('link', { name: 'Download PDF' })).toBeVisible()
  } finally {
    await setLatexMode(page, 'ok')
  }
})
