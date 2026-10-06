import { test, expect } from '@playwright/test'
import { TRICKY_TEXT } from '../fixtures/cv-score/tricky'

// v1.1 — the CV Score page on an uploaded CV with the layout that broke the
// v1.0 parser (no bullet glyphs, company below the dates). Findings cite the
// exact lines, and "How we read it" shows the parsed roles.

test('CV score upload cites lines and shows how the CV was read', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/cv-score')
  await page.getByRole('radio', { name: 'Upload a file' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'tricky-cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(TRICKY_TEXT, 'utf8'),
  })
  await page.getByRole('button', { name: 'Score CV' }).click()

  // Findings carry their cited lines (line number + text).
  const evidence = page.getByTestId('finding-evidence').first()
  await expect(evidence).toBeVisible()
  await expect(evidence.getByText(/^L\d+$/).first()).toBeVisible()
  // The mid-bullet duty phrase is cited and highlighted.
  await expect(page.locator('[data-testid="finding-evidence"] mark', { hasText: 'contributed to' })).toBeVisible()

  await page.getByRole('tab', { name: 'How we read it' }).click()
  const parsed = page.getByTestId('cv-parsed-panel')
  await expect(parsed).toBeVisible()
  for (const company of ['Acme Pay', 'Contoso Solutions', 'Brightpath Academy', 'Fabrikam Robotics']) {
    await expect(parsed.getByRole('cell', { name: company, exact: true })).toBeVisible()
  }
  await expect(parsed.getByText('Not counted', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
