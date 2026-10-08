import { test, expect } from '@playwright/test'
import { WHATS_NEW_E2E_WATCH } from './seed-radar-new'

// Radar › What's new on seeded, synthetic shared rows (tests/e2e/seed-radar-new.ts;
// no network): categories, filters, reason chips, the folded variant, and
// "Watch this" turning an item into a watch term.

test("What's new lists categories, filters them, and Watch this adds a term", async ({ page }) => {
  await page.goto('/radar')
  await page.getByRole('link', { name: "What's new" }).first().click()
  await page.waitForURL(/\/radar\/new$/)
  await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible()

  // One section per category with entries.
  for (const name of ['Models', 'Tools & repos', 'Releases', 'Papers', 'News']) {
    await expect(page.getByRole('heading', { name: new RegExp(`^${name.replace('&', '\\&')}`), level: 2 })).toBeVisible()
  }
  const model = page.getByTestId('whats-new-entry').filter({ hasText: 'Glimmer-12B' })
  await expect(model).toContainText('+1 variants')
  await expect(model).toContainText('Open')
  // The repo is also a Show HN post: one entry, two sources.
  const repo = page.getByTestId('whats-new-entry').filter({ hasText: 'quillfeather' })
  await expect(repo.getByRole('list', { name: 'Why it ranks' })).toContainText('On 2 sources')

  // Filters: models only, open source only.
  await page.getByLabel('Category').selectOption('model')
  await page.getByLabel('Open source only').check()
  await page.getByRole('button', { name: 'Filter' }).click()
  await page.waitForURL(/category=model/)
  await expect(page.getByTestId('whats-new-section')).toHaveCount(1)
  await expect(page.getByTestId('whats-new-entry')).toHaveCount(1)
  await expect(page.getByTestId('whats-new-entry')).toContainText('Glimmer-12B')

  // Watch this.
  await page.goto('/radar/new?category=tool')
  const card = page.getByTestId('whats-new-entry').filter({ hasText: WHATS_NEW_E2E_WATCH })
  await card.getByRole('button', { name: `Watch ${WHATS_NEW_E2E_WATCH}` }).click()
  await expect(page.getByText(`Watching “${WHATS_NEW_E2E_WATCH}”.`)).toBeVisible()
  await expect(card.getByRole('button', { name: `Watching ${WHATS_NEW_E2E_WATCH}` })).toBeDisabled()
  await page.goto('/radar/watchlist')
  await expect(page.getByTestId('watch-term').filter({ hasText: WHATS_NEW_E2E_WATCH })).toBeVisible()
})
