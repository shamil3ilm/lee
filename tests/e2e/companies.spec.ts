import { test, expect, type Locator, type Page } from '@playwright/test'

// Discovery › Companies (local companies & startups): filters, Watch jobs,
// Watch careers page and a Reach out draft, on the synthetic seed
// (tests/e2e/seed-data.ts LOCAL_COMPANIES). It never saves search
// preferences.

const DINAR = 'Dinar Pay Example'
const FALCON = 'Falcon ERP Example'
const BACKWATER = 'Backwater Software Example'

const card = (page: Page, name: string): Locator => page.getByTestId('company-card').filter({ hasText: name })

async function toast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('lists local companies with fit chips and filters them', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await expect(page.getByTestId('companies-tab')).toBeVisible()
  for (const name of [DINAR, FALCON, BACKWATER]) await expect(card(page, name)).toBeVisible()
  // Best fit first, with the reasons.
  await expect(page.getByTestId('company-card').first()).toContainText(DINAR)
  await expect(card(page, DINAR).getByRole('list', { name: 'Why this rank' })).toContainText('Hiring: 2 open roles')

  await page.getByTestId('company-industry').selectOption('erp')
  await expect(page).toHaveURL(/industry=erp/)
  await expect(card(page, FALCON)).toBeVisible()
  await expect(card(page, DINAR)).toHaveCount(0)

  await page.goto('/discoveries?tab=companies&region=kerala')
  await expect(card(page, BACKWATER)).toBeVisible()
  await expect(card(page, DINAR)).toHaveCount(0)

  await page.goto('/discoveries?tab=companies&hiring=1')
  await expect(card(page, DINAR)).toBeVisible()
  await expect(card(page, BACKWATER)).toHaveCount(0)
})

test('browse directories lists the free zones, Kuwait and Kerala parks as links', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  const panel = page.getByTestId('browse-directories')
  await panel.locator('summary').click()
  await expect(panel.getByRole('link', { name: /Hub71 startups/ })).toHaveAttribute('href', 'https://www.hub71.com/startups')
  await expect(panel.getByRole('link', { name: /Central Bank of Kuwait/ })).toBeVisible()
  await expect(panel.getByRole('link', { name: /Infopark companies/ })).toBeVisible()
})

test('Watch jobs adds a source for the company’s job board', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await card(page, DINAR).getByTestId('watch-jobs').click()
  await toast(page, /Watching its job board|Already watching/)
  await expect(card(page, DINAR)).toContainText('Watching its jobs')
  await page.goto('/settings/sources')
  await expect(page.getByText('Dinar Pay Example (Lever)').first()).toBeVisible()
})

test('Watch careers page adds a weekly check-yourself link', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await card(page, FALCON).getByTestId('watch-careers').click()
  await toast(page, /Check these yourself/)
  await expect(card(page, FALCON)).toContainText('Watching its careers page')
})

test('Reach out drafts a fact-locked note with a published careers address and tracks it', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await card(page, DINAR).getByTestId('reach-out').click()
  const dialog = page.getByRole('dialog', { name: `Reach out to ${DINAR}` })
  await expect(dialog.getByTestId('reach-out-body')).not.toHaveValue('')
  await expect(dialog.getByTestId('reach-out-body')).toHaveValue(new RegExp(DINAR))
  await expect(dialog.getByTestId('reach-out-contact')).toContainText('careers@dinarpay.example')
  await expect(dialog.getByRole('link', { name: 'Open in mail app' })).toHaveAttribute('href', /^mailto:careers%40dinarpay\.example\?subject=/)
  await dialog.getByTestId('reach-out-track').click()
  await toast(page, 'Tracked as a speculative application')
  await expect(card(page, DINAR)).toContainText('Speculative application tracked')
})

test('Settings › Search: star Kuwait as top priority (not saved)', async ({ page }) => {
  await page.goto('/settings/search')
  const field = page.getByTestId('preferred-regions')
  await field.locator('[data-star="kw"]').click()
  await field.getByRole('combobox', { name: 'Priority for Kuwait' }).selectOption('top')
  await expect(field.locator('input[name="preferredRegion"]')).toHaveValue('kw:top')
  await field.getByRole('button', { name: 'Unstar Kuwait' }).click()
  await expect(field.locator('input[name="preferredRegion"]')).toHaveCount(0)
})
