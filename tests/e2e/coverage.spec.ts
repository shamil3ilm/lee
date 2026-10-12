import { test, expect } from '@playwright/test'

// Region coverage: the per-region rows in Settings › Sources › Coverage and
// the one-line summary in Discovery. Read-only: it never clicks "Turn on"
// (that would add sources and queue polls for the shared seed user).

test('Settings › Sources › Coverage lists the regions with a status and next steps', async ({ page }) => {
  await page.goto('/settings/sources#coverage')
  const section = page.locator('#coverage')
  await expect(section.getByRole('heading', { name: /^Coverage/ })).toBeVisible()
  // The seed user targets Bengaluru (and Dubai, Dublin for relocation): one row per region.
  const row = section.locator('[data-testid^="coverage-"]').first()
  await expect(row).toBeVisible()
  await expect(row).toContainText(/Good coverage|Thin coverage|No source yet/)
  await expect(row).not.toContainText('None coverage')
  await expect(row).toContainText(/sources? on/)
  // Weak regions offer next steps; alert links open the site's own search page.
  const steps = section.getByRole('list', { name: /Next steps for/ }).first()
  await expect(steps).toBeVisible()
  const alert = steps.getByRole('link', { name: /^Set up a .+ alert for / }).first()
  if (await alert.count()) {
    await expect(alert).toHaveAttribute('target', '_blank')
    await expect(alert).toHaveAttribute('href', /^https:\/\//)
  }
})

test('Discovery asks for starred regions, then shows their coverage once (job list only)', async ({ page }) => {
  await page.goto('/discoveries')
  const line = page.getByTestId('coverage-line')
  await expect(line).toBeVisible()
  // The seed user has no starred regions: one prompt, never the weakest cities.
  const star = line.getByRole('link', { name: 'Star your top regions to see coverage' })
  await expect(star).toHaveAttribute('href', '/settings/search?from=%2Fdiscoveries#preferred-regions')
  await expect(line).not.toContainText(/none/i)
  // Shown once: not on the board, not on the Companies tab.
  await page.goto('/discoveries?view=board')
  await expect(page.locator('[data-board="discoveries"]')).toBeVisible()
  await expect(page.getByTestId('coverage-line')).toHaveCount(0)
  await page.goto('/discoveries?tab=companies')
  await expect(page.getByTestId('coverage-line')).toHaveCount(0)
})
