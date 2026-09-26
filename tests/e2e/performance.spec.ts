import { test, expect } from '@playwright/test'

// Web vitals reporter → POST /api/vitals → web_vitals_daily → Analytics › Performance.
test('page-load vitals are reported and shown per route', async ({ page }) => {
  const beacon = page.waitForResponse(
    (r) => r.url().endsWith('/api/vitals') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.goto('/applications')
  await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
  // The reporter batches and flushes on a short timer (or when the tab hides).
  expect((await beacon).status()).toBe(204)

  await page.goto('/analytics/performance')
  await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Analytics sections' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '/applications', exact: true })).toBeVisible()
})
