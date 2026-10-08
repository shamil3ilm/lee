import { test, expect } from '@playwright/test'

// Branded 404s (audit S6): an unmatched URL and a notFound() inside the
// signed-in shell both show the lee screen with a way back, in the theme.

test('an unknown URL shows the branded 404 with a way home', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: "This page doesn't exist" })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible()
  // Signed in: the main sections and the logs are offered.
  await expect(page.getByRole('navigation', { name: 'Main sections' }).getByRole('link', { name: 'Discovery' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Check the logs' })).toHaveAttribute('href', /\/settings\/logs/)
  await page.getByRole('link', { name: 'Go home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('a missing record keeps the app shell', async ({ page }) => {
  await page.goto('/applications/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('heading', { level: 1, name: "This page doesn't exist" })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible()
})

test.describe('dark theme', () => {
  test.use({ colorScheme: 'dark' })
  test('the 404 follows the theme', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.getByRole('heading', { level: 1, name: "This page doesn't exist" })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).not.toBe('rgb(255, 255, 255)')
  })
})

test('the skip link is the first Tab stop and moves focus to the content', async ({ page }) => {
  await page.goto('/todos')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
})
