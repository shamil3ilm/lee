import { test, expect } from '@playwright/test'
import { waitForHydration } from './ready'

// Sign out from the header's user menu ends the session and lands on
// /signin. Signs in afresh in its own context so the shared storageState
// used by every other spec is never touched.
test.use({ storageState: { cookies: [], origins: [] } })

test('sign out: the user menu signs you out and lands on /signin', async ({ page }) => {
  await page.goto('/signin')
  await page.getByTestId('e2e-test-login').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'))
  await waitForHydration(page)

  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()

  await page.waitForURL((url) => url.pathname.startsWith('/signin'))
  // The session is gone: an authed page sends you back to sign in.
  await page.goto('/discoveries')
  await expect(page).toHaveURL(/\/signin/)
})
