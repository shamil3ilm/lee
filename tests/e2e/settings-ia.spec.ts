import { test, expect } from '@playwright/test'

// Settings IA (Oct 2026 audit): one navigation level in two groups, search
// preferences on their own page with country pickers, old URLs redirected,
// and Sources folded into searchable sections. Read-only except nothing.

test('settings nav groups You and System; old profile sub-routes redirect', async ({ page }) => {
  await page.goto('/settings/profile/resume')
  await expect(page).toHaveURL(/\/settings\/resume$/)
  const nav = page.getByTestId('settings-nav')
  for (const group of ['You', 'System']) {
    await expect(nav.getByRole('group', { name: group }).first()).toBeAttached()
  }
  await expect(nav.getByRole('link', { name: 'Résumé' }).locator('visible=true')).toHaveAttribute('aria-current', 'page')
  // Only one tab level: no Profile sub-tabs on the page.
  await expect(page.getByRole('navigation', { name: 'Profile sections' })).toHaveCount(0)

  await page.goto('/settings/profile/current-job')
  await expect(page).toHaveURL(/\/settings\/current-job$/)
})

test('search preferences: own page, return link, country picker, no duplicate fields in Profile', async ({ page }) => {
  await page.goto('/settings/search?from=/')
  await expect(page.getByRole('heading', { level: 1, name: 'Search preferences' })).toBeVisible()
  await expect(page.getByTestId('settings-return-link')).toHaveText(/Back to Home/)
  await expect(page.getByTestId('settings-return-link')).toHaveAttribute('href', '/')

  const form = page.getByRole('form', { name: 'Search preferences' })
  await expect(form.getByLabel('Preferred work mode')).toBeVisible()
  const picker = form.getByRole('combobox', { name: 'Other countries' })
  await picker.fill('singa')
  await page.getByRole('option', { name: /Singapore/ }).click()
  await expect(form.getByRole('button', { name: 'Remove Singapore' })).toBeVisible()
  await expect(form.locator('input[type="hidden"][name="otherCountries"]')).toHaveValue('SG')
  await expect(page.getByTestId('search-prefs-actions').getByRole('button', { name: 'Save preferences' })).toBeVisible()

  // An unsafe `from` renders no return link.
  await page.goto('/settings/search?from=//evil.example')
  await expect(page.getByTestId('settings-return-link')).toHaveCount(0)

  // Seniority and work mode are no longer edited in Profile.
  await page.goto('/settings/profile')
  await expect(page.getByLabel('Seniority', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Remote preference')).toHaveCount(0)
  await expect(page.getByLabel('Comp currency')).toBeVisible()
})

test('sources: folded sections with summaries; employer watch search and filter', async ({ page }) => {
  await page.goto('/settings/sources')
  const watch = page.locator('section#employer-watch')
  const toggle = watch.getByRole('button', { name: /GCC employer watch/ })
  await expect(toggle).toContainText(/\d+ employers · \d+ watched/)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()

  await watch.getByLabel('Search employers').fill('ADNOC')
  const rows = watch.getByTestId('employer-watch-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('ADNOC')
  // Vendor names and notes sit behind "Details".
  await expect(rows.first().getByText('Phenom')).toBeHidden()
  await rows.first().getByRole('button', { name: 'Details' }).click()
  await expect(rows.first().getByText('Phenom')).toBeVisible()

  await watch.getByLabel('Search employers').fill('')
  await watch.getByLabel('Country').selectOption('QA')
  await expect(rows.first()).toBeVisible()
  for (const name of await rows.allTextContents()) expect(name).not.toContain('ADNOC')
})
