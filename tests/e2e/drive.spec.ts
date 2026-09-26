import { test, expect } from '@playwright/test'

// A2: the E2E test user signs in without a Google account, so every Drive
// surface must show "Connect Google Drive" and nothing else may error.

test('Settings › Integrations shows Drive storage with a Connect button', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/settings/integrations')
  const card = page.getByTestId('drive-storage-card')
  await expect(card).toBeVisible()
  await expect(card.getByText('Not connected')).toBeVisible()
  await expect(card.getByTestId('drive-connect')).toHaveText(/Connect Google Drive/)
  await expect(card.getByTestId('drive-postgres-usage')).toContainText('of 150 MB')
  // No toggle or migration until Drive is connected.
  await expect(card.getByTestId('drive-storage-toggle')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('CV score upload offers an unchecked "Save a copy to Google Drive"', async ({ page }) => {
  await page.goto('/cv-score')
  await page.getByRole('radio', { name: 'Upload a file' }).click()
  const box = page.getByTestId('cv-save-to-drive')
  await expect(box).toBeVisible()
  await expect(box).not.toBeChecked()
})
