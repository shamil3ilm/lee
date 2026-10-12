import { test, expect } from '@playwright/test'

// v17 §9.6 item 7 — Settings › Usage renders for the test user with no
// vendor keys: database size is measured, Neon compute/egress ask for a key,
// Vercel meters point at the Vercel dashboard.
//
// Invite beta: the E2E test user is a MEMBER (ALLOWED_EMAIL is someone
// else), so the deployment controls (Refresh now, the Neon connection, the
// largest tables) are the owner's and not shown here.

test('settings: usage tab renders meters without vendor keys', async ({ page }) => {
  await page.goto('/settings/usage')
  await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Usage' })).toBeVisible()

  const storage = page.getByTestId('usage-meter-neon_storage')
  await expect(storage).toContainText('Database storage')
  await expect(storage.getByTestId('usage-source')).toHaveText('Measured')
  await expect(storage.getByRole('meter', { name: 'Database storage' })).toBeVisible()

  await expect(page.getByTestId('usage-meter-neon_compute').getByTestId('usage-source')).toHaveText(
    'Not measured: add a Neon API key',
  )
  await expect(page.getByTestId('usage-meter-vercel_active_cpu').getByTestId('usage-source')).toHaveText(
    'Not available on Hobby: see Vercel dashboard',
  )
})

test('settings: deployment controls and invites are the owner’s', async ({ page }) => {
  await page.goto('/settings/usage')
  await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh now' })).toHaveCount(0)
  await expect(page.getByTestId('usage-neon-status')).toHaveCount(0)
  await expect(page.getByTestId('usage-largest-tables')).toHaveCount(0)

  const res = await page.goto('/settings/invites')
  expect(res?.status()).toBe(404)
})
