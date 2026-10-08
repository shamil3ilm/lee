import { test, expect } from '@playwright/test'

// Settings › Sources › Google Alerts: setup steps, suggested queries with
// copy buttons, and a guard on the RSS link. Read-only (nothing is saved).

test('Google Alerts panel suggests queries and validates the feed link', async ({ page }) => {
  // A deep link to the section opens it (it starts folded).
  await page.goto('/settings/sources#google-alerts')
  const panel = page.getByTestId('google-alerts-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('link', { name: /google\.com\/alerts/ })).toHaveAttribute('href', 'https://www.google.com/alerts')
  const queries = panel.getByRole('list', { name: 'Suggested Google Alerts queries' })
  await expect(queries.getByRole('listitem').first()).toContainText('hiring')
  await panel.getByLabel('RSS feed link (optional)').fill('https://evil.example/feed')
  await panel.getByRole('button', { name: /Add Google Alerts|Save/ }).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Paste the alert’s RSS link' }).first()).toBeVisible()
})
