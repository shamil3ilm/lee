import { test, expect } from '@playwright/test'

// Before search preferences are saved, the domain filter runs on defaults
// from the profile: Discovery and the Shortlist say so, link to the
// settings (and come back) and offer the inferred role families as
// one-click chips. It is the one notice shown above the list.
// Read-only (Confirm is not clicked, so later journeys see unsaved prefs).

test('Discovery and Shortlist show the defaults banner while preferences are unsaved', async ({ page }) => {
  for (const path of ['/discoveries', '/shortlist']) {
    await page.goto(path)
    const banner = page.getByTestId('defaults-banner')
    await expect(banner, path).toBeVisible()
    await expect(banner).toContainText('Filtering is using defaults from your profile.')
    await expect(banner.getByRole('link', { name: 'Set preferences' })).toHaveAttribute(
      'href',
      `/settings/search?from=${encodeURIComponent(path)}`,
    )
    await expect(banner.getByRole('button', { name: 'Confirm' })).toBeVisible()
  }
})
