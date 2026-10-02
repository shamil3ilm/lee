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
  await expect(page.getByRole('heading', { name: /what you’re looking for/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Set preferences' })).toBeVisible()
  const top = page.getByTestId('pager-top')
  await expect(top).toContainText(/^1–\d+ of \d+/)
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Senior Backend Engineer, Ledger' })).toBeVisible()

  // Save preferences: backend / full-stack, junior + mid, default GCC + India.
  await page.goto('/settings/profile')
  const form = page.getByRole('form', { name: 'Search preferences' })
  await form.getByText('Backend', { exact: true }).click()
  await form.getByText('Full-stack', { exact: true }).click()
  await form.getByText('Junior', { exact: true }).click()
  await form.getByText('Mid-level', { exact: true }).click()
  await form.getByRole('button', { name: 'Save preferences' }).click()
  await expectToast(page, 'Search preferences saved')

  // The senior role left the inbox; the summary card replaced the prompt.
  await page.goto('/discoveries')
  await expect(page.getByRole('heading', { name: 'What you’re looking for' })).toBeVisible()
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Senior Backend Engineer, Ledger' })).toHaveCount(0)

  // Filtered out, with the reason; "Show anyway" brings it back.
  await page.goto('/discoveries?status=filtered')
  const row = page.locator('[data-slot="card"]').filter({ hasText: 'Senior Backend Engineer, Ledger' })
  await expect(row).toBeVisible()
  await expect(row.getByTestId('relevance-chips')).toContainText('seniority: Senior')
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Payments Infrastructure (Contract' }).getByTestId('relevance-chips')).toContainText('contract / freelance')
  await row.getByRole('button', { name: 'Show anyway' }).click()
  await expectToast(page, 'Moved to your inbox')
  await page.goto('/discoveries')
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Senior Backend Engineer, Ledger' })).toBeVisible()

  // Page size is remembered.
  await page.getByRole('combobox', { name: 'Rows per page' }).first().selectOption('25')
  await expect(page).toHaveURL(/size=25/)
  await page.goto('/discoveries')
  await expect(page.getByRole('combobox', { name: 'Rows per page' }).first()).toHaveValue('25')

  // Clean up: turn filtering off, everything returns to the inbox.
  await page.goto('/settings/profile')
  await page.getByRole('button', { name: 'Turn off filtering' }).click()
  await expectToast(page, 'Filtering turned off')
  await page.goto('/discoveries?status=filtered')
  await expect(page.getByText('Nothing filtered out', { exact: true })).toBeVisible()
})
