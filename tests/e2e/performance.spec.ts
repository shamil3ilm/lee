import { test, expect } from '@playwright/test'

// Web vitals reporter → POST /api/vitals → web_vitals_daily → Analytics › Performance.
test('page-load vitals are reported and shown per route', async ({ page }) => {
  // The whole e2e suite shares one user, so earlier specs can use up the
  // per-minute beacon budget (429). Reload until a beacon lands; the window
  // resets within a minute.
  test.setTimeout(120_000)
  await expect
    .poll(
      async () => {
        const beacon = page.waitForResponse(
          (r) => r.url().endsWith('/api/vitals') && r.request().method() === 'POST',
          { timeout: 30_000 },
        )
        await page.goto('/applications')
        await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
        // The reporter batches and flushes on a short timer (or when the tab hides).
        return (await beacon).status()
      },
      { timeout: 100_000, intervals: [15_000] },
    )
    .toBe(204)

  await page.goto('/analytics/performance')
  await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Analytics sections' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '/applications', exact: true })).toBeVisible()
})
