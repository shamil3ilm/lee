import { test, expect, type Locator, type Page } from '@playwright/test'

// Discovery › Companies (local companies & startups): filters, Watch jobs,
// Watch careers page and a Reach out draft, on the synthetic seed
// (tests/e2e/seed-data.ts LOCAL_COMPANIES). It never saves search
// preferences.

const DINAR = 'Dinar Pay Example'
const FALCON = 'Falcon ERP Example'
const BACKWATER = 'Backwater Software Example'

const card = (page: Page, name: string): Locator => page.getByTestId('company-card').filter({ hasText: name })

/** Fold out a row's details (fit reasons, sources, Reach out). */
async function details(page: Page, name: string): Promise<Locator> {
  await card(page, name).getByTestId('company-details-toggle').click()
  return card(page, name).getByTestId('company-details')
}

async function filters(page: Page): Promise<Locator> {
  await page.getByTestId('company-filters-button').click()
  return page.getByTestId('company-filters-panel')
}

async function toast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('lists local companies with fit chips and filters them', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await expect(page.getByTestId('companies-tab')).toBeVisible()
  for (const name of [DINAR, FALCON, BACKWATER]) await expect(card(page, name)).toBeVisible()
  // Best fit first, with the reasons: the small, fast-growing company leads.
  await expect(page.getByTestId('company-card').first()).toContainText(BACKWATER)
  // One line per company: location chain, fit, growth and open roles; the reasons fold out.
  await expect(card(page, DINAR).getByTestId('company-location')).toHaveText('Kuwait City › Kuwait › GCC')
  await expect(card(page, DINAR).getByTestId('company-hiring')).toHaveText('2 open roles')
  await expect(card(page, DINAR).getByRole('list', { name: 'Why this rank' })).toHaveCount(0)
  await expect((await details(page, DINAR)).getByRole('list', { name: 'Why this rank' })).toContainText('Hiring: 2 open roles')

  await (await filters(page)).getByTestId('company-industry').selectOption('erp')
  await expect(page).toHaveURL(/industry=erp/)
  await page.keyboard.press('Escape')
  // The active filter shows as a removable chip.
  await expect(page.getByTestId('company-active-filter')).toHaveText(/ERP/)
  await expect(card(page, FALCON)).toBeVisible()
  await expect(card(page, DINAR)).toHaveCount(0)

  await page.goto('/discoveries?tab=companies&region=kerala')
  await expect(card(page, BACKWATER)).toBeVisible()
  await expect(card(page, DINAR)).toHaveCount(0)

  await page.goto('/discoveries?tab=companies&hiring=1')
  await expect(card(page, DINAR)).toBeVisible()
  await expect(card(page, BACKWATER)).toHaveCount(0)
  await page.getByTestId('company-active-filter').filter({ hasText: 'job board' }).click()
  await expect(page).not.toHaveURL(/hiring=1/)
  await expect(card(page, BACKWATER)).toBeVisible()
})

test('segments: Suggested, Under the radar, Watching and All, with counts', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  const segments = page.getByTestId('company-segments')
  await expect(segments.getByTestId('company-segment-suggested')).toHaveAttribute('aria-current', 'page')
  await segments.getByTestId('company-segment-radar').click()
  await expect(page).toHaveURL(/view=radar/)
  await expect(card(page, BACKWATER)).toBeVisible()
  await expect(card(page, DINAR)).toHaveCount(0)
  await page.getByTestId('company-segment-all').click()
  await expect(card(page, DINAR)).toBeVisible()
})

test('browse directories lists the free zones, Kuwait and Kerala parks as links', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  const panel = page.getByTestId('browse-directories')
  await panel.getByRole('button', { name: /Browse directories/ }).click()
  await expect(panel.getByRole('link', { name: /Hub71 startups/ })).toHaveAttribute('href', 'https://www.hub71.com/startups')
  await expect(panel.getByRole('link', { name: /Central Bank of Kuwait/ })).toBeVisible()
  await expect(panel.getByRole('link', { name: /Infopark companies/ })).toBeVisible()
})

test('growth chip, its "Why" popover, sort by growth, minimum growth and "Under the radar"', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  const chip = card(page, BACKWATER).getByTestId('growth-chip')
  await expect(chip).toContainText(/Growth \d+ · (high|medium|low) confidence/)
  await chip.click()
  const why = page.getByTestId('growth-why')
  await expect(why).toBeVisible()
  await expect(why.getByRole('list', { name: 'Measured growth signals' })).toContainText('Hiring velocity')
  await expect(why.getByRole('list', { name: 'Measured growth signals' })).toContainText('Engineering activity')
  await expect(why.getByRole('list', { name: 'Growth signals not measured yet' })).toContainText('Funding and expansion news')
  await page.keyboard.press('Escape')
  await expect(card(page, FALCON).getByTestId('growth-chip')).toContainText('Growth unknown')

  await page.getByTestId('company-sort').selectOption('growth')
  await expect(page).toHaveURL(/sort=growth/)
  await expect(page.getByTestId('company-card').first()).toContainText(BACKWATER)
  // Unknown growth sorts after every known score.
  const names = await page.getByTestId('company-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-company') ?? ''))
  expect(names.indexOf(FALCON)).toBeGreaterThan(names.indexOf(DINAR))

  await (await filters(page)).getByTestId('company-min-growth').selectOption('70')
  await expect(page).toHaveURL(/minGrowth=70/)
  await page.keyboard.press('Escape')
  await expect(card(page, BACKWATER)).toBeVisible()
  await expect(card(page, FALCON)).toHaveCount(0)

  await page.goto('/discoveries?tab=companies&gems=1')
  await expect(card(page, BACKWATER).getByTestId('under-the-radar')).toContainText('Under the radar')
  await expect(card(page, DINAR)).toHaveCount(0)
})

test('Watch on a company with a job board adds a source for it', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await card(page, DINAR).getByTestId('company-watch').click()
  await toast(page, /Watching its job board|Already watching/)
  // Watching moves the company to the Watching segment.
  await page.goto('/discoveries?tab=companies&view=watching')
  await expect(card(page, DINAR)).toContainText('Watching its jobs')
  await page.goto('/settings/sources')
  await expect(page.getByText('Dinar Pay Example (Lever)').first()).toBeVisible()
})

test('Watch on a company without a job board adds a weekly check-yourself link', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await card(page, FALCON).getByTestId('company-watch').click()
  await toast(page, /Check these yourself/)
  // Older ?status=saved links still open the Watching segment.
  await page.goto('/discoveries?tab=companies&status=saved')
  await expect(card(page, FALCON)).toContainText('Watching its careers page')
})

test('Reach out drafts a fact-locked note with a published careers address and tracks it', async ({ page }) => {
  // Dinar Pay is under Saved once its jobs are watched (the test above).
  await page.goto('/discoveries?tab=companies&view=watching')
  await (await details(page, DINAR)).getByTestId('reach-out').click()
  const dialog = page.getByRole('dialog', { name: `Reach out to ${DINAR}` })
  await expect(dialog.getByTestId('reach-out-body')).not.toHaveValue('')
  await expect(dialog.getByTestId('reach-out-body')).toHaveValue(new RegExp(DINAR))
  await expect(dialog.getByTestId('reach-out-contact')).toContainText('careers@dinarpay.example')
  await expect(dialog.getByRole('link', { name: 'Open in mail app' })).toHaveAttribute('href', /^mailto:careers%40dinarpay\.example\?subject=/)
  await dialog.getByTestId('reach-out-track').click()
  await toast(page, 'Tracked as a speculative application')
  await expect(card(page, DINAR)).toContainText('Speculative application tracked')
})

test('Find a company by name: lee suggests, you confirm, it is added', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  const box = page.getByTestId('company-search')
  await box.getByTestId('company-search-input').fill('Lagoon Labs Example, Kochi')
  await box.getByTestId('company-search-submit').click()
  await expect(box.getByTestId('company-search-option').first()).toContainText('Lagoon Labs Example')
  await expect(box.getByTestId('company-search-website')).toHaveValue('https://lagoonlabsexample.example')
  await box.getByTestId('company-search-add').click()
  await toast(page, /Added Lagoon Labs Example|already in your list/)
  await expect(card(page, 'Lagoon Labs Example')).toBeVisible()
  await expect(await details(page, 'Lagoon Labs Example')).toContainText('Added by you (search)')
})

test('bulk select: mark two companies not interested, then restore one', async ({ page }) => {
  await page.goto('/discoveries?tab=companies')
  await card(page, 'Setu').getByTestId('company-select').check()
  await card(page, 'Plane').getByTestId('company-select').check()
  const bar = page.getByTestId('company-bulk-bar')
  await expect(bar).toContainText('2 selected')
  await bar.getByTestId('company-bulk-dismiss').click()
  await toast(page, '2 companies marked not interested')
  await expect(card(page, 'Setu')).toHaveCount(0)
  await (await filters(page)).getByTestId('company-show-dismissed').click()
  await expect(page).toHaveURL(/view=dismissed/)
  await card(page, 'Setu').getByRole('button', { name: 'Restore' }).click()
  await toast(page, 'Restored')
  await expect(card(page, 'Setu')).toHaveCount(0)
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
