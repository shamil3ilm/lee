import { test, expect, type Page } from '@playwright/test'

// Google AI Mode hand-off (a plain link, opened by the user; lee never
// contacts Google) and "Add from text or link" → review → discoveries.
// Links point at example domains, so the import reads no ATS board.

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('the AI Mode button opens Google AI Mode with the edited prompt (href only)', async ({ page }) => {
  await page.goto('/discoveries')
  await page.getByTestId('ai-mode-trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Search with Google AI Mode' })
  const first = dialog.getByTestId('ai-mode-prompt').first()
  const link = first.getByTestId('ai-mode-open')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

  const prompt = await first.getByRole('textbox').inputValue()
  const href = (await link.getAttribute('href')) ?? ''
  expect(href.startsWith('https://www.google.com/search?udm=50&q=')).toBe(true)
  expect(new URL(href).searchParams.get('q')).toBe(prompt)

  await first.getByRole('textbox').fill('Data analyst jobs in Doha & Dubai #remote')
  const edited = new URL((await link.getAttribute('href')) ?? '')
  expect(edited.searchParams.get('udm')).toBe('50')
  expect(edited.searchParams.get('q')).toBe('Data analyst jobs in Doha & Dubai #remote')
  await expect(dialog).toContainText('Incognito')
})

test('Add from text or link imports the picked openings into Discovery', async ({ page }) => {
  await page.goto('/discoveries')
  await page.getByTestId('paste-import-trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Add from text or link' })
  await dialog.getByTestId('paste-import-text').fill(
    [
      'Here are current openings:',
      '1. Integration Engineer at Paste Sample Co (Dubai) https://careers.paste-sample.example/jobs/101',
      '2. Data Analyst — Paste Sample Bank — Riyadh — https://careers.paste-bank.example/jobs/202',
      '3. Clerk at Gov Sample — UAE nationals only — https://careers.gov-sample.example/jobs/303',
    ].join('\n'),
  )
  await dialog.getByTestId('paste-import-find').click()

  // The nationals-only opening is left out; the other two are listed.
  const rows = dialog.getByTestId('paste-import-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByRole('textbox', { name: 'Job title' })).toHaveValue('Integration Engineer')
  await expect(rows.nth(1).getByRole('textbox', { name: 'Employer' })).toHaveValue('Paste Sample Bank')

  // Untick the second; import the first.
  await rows.nth(1).getByRole('checkbox').uncheck()
  await dialog.getByTestId('paste-import-submit').click()
  await expectToast(page, /1 added to Discovery/)

  // It is a discovery of the "Added by you" source.
  // Source is one of the "More filters" (applied on change).
  await page.getByTestId('more-filters').click()
  await page.locator('#disc-source').selectOption({ label: 'Added by you' })
  await expect(page).toHaveURL(/source=/)
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Integration Engineer' })).toBeVisible()
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Data Analyst' })).toHaveCount(0)

  // Importing the same link again is a duplicate.
  await page.getByTestId('paste-import-trigger').click()
  await dialog.getByTestId('paste-import-text').fill('Integration Engineer at Paste Sample Co https://careers.paste-sample.example/jobs/101')
  await dialog.getByTestId('paste-import-find').click()
  await dialog.getByTestId('paste-import-submit').click()
  await expectToast(page, /0 added to Discovery · 1 already there/)
})
