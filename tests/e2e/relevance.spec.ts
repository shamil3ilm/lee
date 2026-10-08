import { test, expect, type Page } from '@playwright/test'

// Discovery relevance: search preferences filter the inbox before AI
// scoring, filtered postings keep their reason and can be shown anyway,
// and the pager shows "1–N of M" above the list. The spec turns filtering
// off again at the end so later files see the seeded inbox unchanged.

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('search preferences filter Discovery, with reasons and "Show anyway"', async ({ page }) => {
  // No preferences yet: nothing filtered, and a prompt to set them.
  await page.goto('/discoveries')
  // One compact notice: filtering on defaults, with a link to set preferences.
  await expect(page.getByTestId('notice-area')).toHaveAttribute('data-notice', 'defaults')
  await expect(page.getByTestId('defaults-banner').getByRole('link', { name: 'Set preferences' })).toBeVisible()
  const top = page.getByTestId('pager-top')
  await expect(top).toContainText(/^1–\d+ of \d+/)
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Senior Backend Engineer, Ledger' })).toBeVisible()

  // Save preferences: backend / full-stack, junior + mid, default GCC + India.
  await page.goto('/settings/search')
  const form = page.getByRole('form', { name: 'Search preferences' })
  // check(), not click(): the seeded profile already targets Backend.
  for (const name of ['Backend', 'Full-stack', 'Junior', 'Mid-level']) {
    await form.getByRole('checkbox', { name, exact: true }).check({ force: true })
  }
  await form.getByRole('button', { name: 'Save preferences' }).click()
  await expectToast(page, 'Search preferences saved')
  // The re-check is visible: "Re-checking N jobs… M filtered out", then done.
  await expect(form.getByTestId('recheck-progress')).toContainText(/Re-check(?:ed|ing) \d+ jobs/)

  // A Senior title is a soft stretch now: it stays in the inbox with a chip;
  // the summary card replaced the prompt.
  await page.goto('/discoveries')
  await expect(page.getByRole('heading', { name: 'What you’re looking for' })).toBeVisible()
  const senior = page.locator('[data-slot="card"]').filter({ hasText: 'Senior Backend Engineer, Ledger' })
  await expect(senior).toBeVisible()
  // The "ranked lower" reason sits in the score popover.
  await senior.getByRole('button', { name: /Why this score/ }).click()
  await expect(page.getByTestId('ranking-notes')).toContainText('Senior title')
  await page.keyboard.press('Escape')

  // Filtered out, with the reason; "Show anyway" brings it back.
  await page.goto('/discoveries?status=filtered')
  const row = page.locator('[data-slot="card"]').filter({ hasText: 'Payments Infrastructure (Contract' })
  await expect(row).toBeVisible()
  await expect(row.getByTestId('relevance-chips')).toContainText('contract / freelance')
  // Filtered rows still show their Match Score.
  // (Its seeded JD is short, so the score is flagged "title only".)
  await expect(row.getByTestId('match-badge')).toContainText(/Fit ~?\d+/)
  await row.getByRole('button', { name: 'Show anyway' }).click()
  await expectToast(page, 'Moved to your inbox')
  await page.goto('/discoveries')
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Payments Infrastructure (Contract' })).toBeVisible()

  // Page size is remembered.
  await page.getByRole('combobox', { name: 'Rows per page' }).first().selectOption('25')
  await expect(page).toHaveURL(/size=25/)
  await page.goto('/discoveries')
  await expect(page.getByRole('combobox', { name: 'Rows per page' }).first()).toHaveValue('25')

  // Clean up: turn filtering off, everything returns to the inbox.
  await page.goto('/settings/search')
  await page.getByRole('button', { name: 'Turn off filtering' }).click()
  await expectToast(page, 'Filtering turned off')
  await page.goto('/discoveries?status=filtered')
  await expect(page.getByText('Nothing filtered out', { exact: true })).toBeVisible()
})
