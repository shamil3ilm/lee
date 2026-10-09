import { test, expect, type Locator, type Page } from '@playwright/test'
import { COMPARE_DISCOVERY_TITLE } from './seed-data'

// The hierarchical Region filter on Discovery (and the Shortlist): quick
// picks, search, parent/child semantics and "Group by region". Reads the
// dismissed seed postings only (tests/e2e/seed-data.ts REGION_SEEDS), so
// no other journey is affected; it never saves search preferences.

const KOCHI = 'Region Kochi Laravel Developer'
const TVM = 'Region Trivandrum PHP Engineer'
const ABU_DHABI = 'Region Abu Dhabi Backend Developer'
const RIYADH = 'Region Riyadh API Engineer'
const DUBAI = COMPARE_DISCOVERY_TITLE
const BENGALURU = 'Frontend Engineer'
const ALL = [KOCHI, TVM, ABU_DHABI, RIYADH, DUBAI, BENGALURU]

const card = (page: Page, title: string): Locator => page.locator('[data-slot="card"]').filter({ hasText: title })

async function expectOnly(page: Page, visible: readonly string[]): Promise<void> {
  for (const title of visible) await expect(card(page, title).first(), title).toBeVisible()
  for (const title of ALL.filter((t) => !visible.includes(t))) await expect(card(page, title), title).toHaveCount(0)
}

async function openPicker(page: Page): Promise<Locator> {
  await page.getByTestId('region-filter').click()
  const dialog = page.getByRole('dialog', { name: 'Region' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function quickPick(page: Page, name: string, param: string): Promise<void> {
  await page.goto('/discoveries?status=dismissed')
  const dialog = await openPicker(page)
  await dialog.getByRole('button', { name, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`region=${param}(&|$)`))
  await page.keyboard.press('Escape')
}

test('pick Kerala → only Kerala jobs, with the most specific place label', async ({ page }) => {
  await quickPick(page, 'Kerala', 'kerala')
  await expectOnly(page, [KOCHI, TVM])
  await expect(card(page, KOCHI).getByTestId('place-label')).toHaveText('Kochi, Kerala · Infopark')
  await expect(card(page, TVM).getByTestId('place-label')).toHaveText('Thiruvananthapuram, Kerala · Technopark')
  // The chain is on hover.
  await expect(card(page, KOCHI).getByTestId('place-label')).toHaveAttribute('title', /Kochi › Kerala › India/)
  // The selection shows as a removable chip; removing it clears the filter.
  await page.getByRole('button', { name: 'Remove Kerala' }).click()
  await expect(page).not.toHaveURL(/region=/)
  await expectOnly(page, ALL)
})

test('pick GCC → every Gulf posting', async ({ page }) => {
  await quickPick(page, 'GCC', 'gcc')
  await expectOnly(page, [ABU_DHABI, RIYADH, DUBAI])
})

test('pick Dubai only (by search) → Dubai only', async ({ page }) => {
  await page.goto('/discoveries?status=dismissed')
  const dialog = await openPicker(page)
  await dialog.getByRole('searchbox').fill('dubai')
  await dialog.getByRole('checkbox', { name: 'Dubai', exact: true }).check()
  await expect(page).toHaveURL(/region=dubai(&|$)/)
  await page.keyboard.press('Escape')
  await expectOnly(page, [DUBAI])
})

test('quick picks: UAE, India, Bengaluru and Remote', async ({ page }) => {
  await quickPick(page, 'UAE', 'ae')
  await expectOnly(page, [ABU_DHABI, DUBAI])
  await quickPick(page, 'India', 'in')
  await expectOnly(page, [KOCHI, TVM, BENGALURU])
  await quickPick(page, 'Bengaluru', 'bengaluru')
  await expectOnly(page, [BENGALURU])
  await quickPick(page, 'Remote', 'remote')
  await expectOnly(page, [])
})

test('unticking a city under a selected country keeps its siblings; the parent shows mixed', async ({ page }) => {
  await page.goto('/discoveries?status=dismissed&region=ae')
  const dialog = await openPicker(page)
  await dialog.getByRole('button', { name: 'Show places in United Arab Emirates' }).click()
  const dubai = dialog.getByRole('checkbox', { name: 'Dubai', exact: true })
  await expect(dubai).toBeChecked()
  await dubai.uncheck()
  await expect(page).toHaveURL(/region=[^&]*abu-dhabi/)
  const uae = dialog.getByRole('checkbox', { name: 'United Arab Emirates', exact: true })
  await expect.poll(() => uae.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true)
  await page.keyboard.press('Escape')
  await expectOnly(page, [ABU_DHABI])
})

test('old single-region links keep working', async ({ page }) => {
  await page.goto('/discoveries?status=dismissed&region=gcc')
  await expect(page.getByTestId('region-filter')).toContainText('GCC')
  await expectOnly(page, [ABU_DHABI, RIYADH, DUBAI])
})

test('group by region counts GCC → country → city', async ({ page }) => {
  await page.goto('/discoveries?status=dismissed')
  await page.getByTestId('group-by-region').click()
  await expect(page).toHaveURL(/by=region/)
  const groups = page.getByTestId('region-groups')
  await expect(groups).toBeVisible()
  await expect(groups.getByRole('link', { name: /^GCC\s*3$/ })).toBeVisible()
  await expect(groups.getByRole('link', { name: /^UAE\s*2$/ })).toBeVisible()
  await expect(groups.getByRole('link', { name: /^Kerala\s*2$/ })).toBeVisible()
  await groups.getByRole('link', { name: /^Kerala\s*2$/ }).click()
  await expect(page).toHaveURL(/region=kerala/)
  await expectOnly(page, [KOCHI, TVM])
})

test('the Shortlist has the same Region filter', async ({ page }) => {
  await page.goto('/shortlist?region=kerala')
  await expect(page.getByTestId('region-filter')).toContainText('Kerala')
  // No seeded pick is in Kerala: the list says so and offers every region.
  await expect(page.getByText('No picks in these regions today')).toBeVisible()
  await page.getByRole('link', { name: 'Show all regions' }).click()
  await expect(page).toHaveURL(/\/shortlist$/)
})

test('Settings › Search picks regions hierarchically (not saved)', async ({ page }) => {
  await page.goto('/settings/search')
  const picker = page.getByTestId('target-regions')
  await expect(picker.getByTestId('target-regions-picker')).toContainText('GCC, India')
  await picker.getByTestId('target-regions-picker').click()
  const dialog = page.getByRole('dialog', { name: 'Target regions' })
  // The Kerala quick pick narrows India to Kerala; GCC stays.
  await dialog.getByRole('button', { name: 'Kerala', exact: true }).click()
  const hidden = picker.locator('input[type="hidden"][name="region"]')
  await expect.poll(() => hidden.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['gcc', 'kerala'])
  // Calicut (old name, Cyberpark) lies within Kerala, so it is already ticked.
  await dialog.getByRole('searchbox').fill('calicut')
  await expect(dialog.getByRole('checkbox', { name: /^Kozhikode/ })).toBeChecked()
  await page.keyboard.press('Escape')
  await picker.getByRole('button', { name: 'Remove GCC' }).click()
  await expect.poll(() => hidden.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['kerala'])
  await expect(picker.getByTestId('target-regions-picker')).toContainText('Kerala')
})
