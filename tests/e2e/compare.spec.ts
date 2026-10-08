import { test, expect, type Page } from '@playwright/test'

// Compare with my current job: fill in the (seeded, synthetic) current job
// and the money assumptions, open the GCC discovery, read the comparison
// card, then put it side by side with a saved application.

const GCC_TITLE = 'Senior Backend Engineer, E-invoicing'
const APP_TITLE = 'Senior Backend Developer, Jira Platform'

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('current job → comparison card on a discovery → side by side for two jobs', async ({ page }) => {
  await page.goto('/settings/current-job')
  await expect(page.getByRole('heading', { level: 1, name: 'Current job' })).toBeVisible()
  await page.getByLabel('Employer', { exact: true }).fill('Synthetic Systems Pvt Ltd')
  await page.getByLabel('Title', { exact: true }).fill('Software Engineer')
  await page.getByLabel('Country', { exact: true }).selectOption('IN')
  await page.getByLabel('Monthly gross pay').fill('1,40,000')
  await page.getByLabel('Currency', { exact: true }).selectOption('INR')
  await page.getByLabel('Health insurance').selectOption('self')
  await page.getByLabel('Growth / learning').selectOption('2')
  await page.getByRole('button', { name: 'Save current job' }).click()
  await expectToast(page, 'Current job saved')

  await page.getByLabel('INR per USD').fill('83.5')
  await page.getByLabel('India effective tax %').fill('15')
  await page.getByRole('button', { name: 'Save assumptions' }).click()
  await expectToast(page, 'Assumptions saved')
  await expect(page.getByTestId('fx-updated')).toContainText('1 AED = 22.74 INR')

  // The GCC posting (dismissed, so other journeys never see it).
  await page.goto('/discoveries?status=dismissed')
  await page.getByRole('link', { name: `Details and comparison: ${GCC_TITLE}` }).click()
  await expect(page).toHaveURL(/\/discoveries\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: GCC_TITLE })).toBeVisible()
  const card = page.getByTestId('comparison-card')
  await expect(card.getByTestId('compare-verdict')).toHaveText(/^Likely \+\d+% take-home/)
  await expect(card.getByTestId('benefits-checklist')).toContainText('Annual flight home')
  await expect(card.getByTestId('compare-gains')).toContainText('Family medical cover')
  await expect(card.getByTestId('compare-questions')).toContainText('Is there a performance or annual bonus')
  await expect(card.getByText('Posted: AED 20,000/mo – AED 24,000/mo')).toBeVisible()

  // Side by side with a saved application.
  await card.getByRole('link', { name: 'Side by side' }).click()
  await expect(page).toHaveURL(/\/compare\?ids=d%3A[0-9a-f-]{36}$/)
  await expect(page.getByTestId('compare-row')).toHaveCount(1)
  await page.getByRole('checkbox', { name: new RegExp(APP_TITLE) }).check()
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByTestId('compare-row')).toHaveCount(2)
  await expect(page.getByRole('table')).toContainText('Current job')
  await expect(page.getByTestId('compare-row').filter({ hasText: GCC_TITLE })).toBeVisible()

  // Weights edit live and never drop a row.
  await page.getByLabel('Growth weight').fill('3')
  await expect(page.getByTestId('compare-row')).toHaveCount(2)
})
