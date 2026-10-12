import { test, expect } from '@playwright/test'

// Invite beta: a refused Google sign-in comes back to /signin with
// ?error=AccessDenied, which explains that lee is invite-only.
test.use({ storageState: { cookies: [], origins: [] } })

test('signin: a refused sign-in explains the invite-only beta', async ({ page }) => {
  await page.goto('/signin?error=AccessDenied')
  await expect(page.getByTestId('signin-error')).toContainText('invite-only')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('signin: no message without an error', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByTestId('signin-error')).toHaveCount(0)
})
