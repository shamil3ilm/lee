import { test, expect } from '@playwright/test'

// v16 phases 16.0 and 16.1 — the AI Radar loop on seeded, synthetic data
// (tests/e2e/seed-radar.ts; no network): add a watch term, see the matched
// entry highlighted and counted, open it, draft a grounded brief with the
// fixture AI (sources are the items' own text offline), confirm it and
// turn it into Playground cards.

const TERM = 'Zorblax'

test('watch a term, see matches, open an entry and build a grounded brief', async ({ page }) => {
  // Before any watch term: the seeded entries are listed, nothing is highlighted.
  await page.goto('/radar')
  await expect(page.getByRole('heading', { name: 'Radar', level: 1 })).toBeVisible()
  await expect(page.getByTestId('radar-entry').first()).toBeVisible()
  await expect(page.locator('mark[data-watch-match]')).toHaveCount(0)

  // Add the watch term.
  await page.getByRole('link', { name: 'Watchlist' }).first().click()
  await page.waitForURL(/\/radar\/watchlist$/)
  await page.getByLabel('Term or name').fill(TERM)
  await page.getByLabel(/Aliases/).fill('ZBX')
  await page.getByRole('button', { name: 'Watch' }).click()
  await expect(page.getByTestId('watch-term').filter({ hasText: TERM })).toBeVisible()

  // Matched entries: highlighted, marked new, counted in the nav, and filterable.
  await page.goto('/radar?watched=1')
  const entry = page.getByTestId('radar-entry').first()
  await expect(entry).toContainText('New')
  await expect(entry.locator('mark[data-watch-match]').first()).toHaveText(new RegExp(TERM, 'i'))
  await expect(page.getByTestId('radar-entry')).toHaveCount(1)
  await expect(page.getByRole('navigation').getByLabel(/pending/).first()).toBeVisible()

  // The entry page: first seen per source, a computed timeline.
  await entry.getByRole('link', { name: 'Introducing Zorblax' }).first().click()
  await page.waitForURL(/\/radar\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('list', { name: 'First seen per source' })).toContainText('OpenAI News')
  await expect(page.getByRole('list', { name: 'First seen per source' })).toContainText('GitHub')
  await expect(page.getByRole('list', { name: 'Timeline' })).toContainText('Announced on OpenAI News')
  await expect(page.getByRole('list', { name: 'Timeline' })).toContainText('Repository created')

  // Draft a brief: cited sentences only; the fixture's invented one is dropped.
  const brief = page.getByTestId('radar-brief')
  await brief.getByRole('button', { name: 'Generate brief' }).click()
  await expect(brief).toContainText('Draft — not saved')
  await expect(brief).toContainText('failed the citation check')
  await expect(brief.getByRole('link', { name: '[S1]' }).first()).toBeVisible()
  await expect(brief).toContainText('Official post')
  await expect(brief).toContainText('Repository README')
  await brief.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(brief).toContainText('Confirmed by you on')

  // Learn this: the brief becomes Playground review cards.
  // (Other journeys may have queued content cards too, so the review page's
  // order is not fixed; the integration test checks the card is due.)
  await brief.getByRole('button', { name: 'Learn this' }).click()
  await expect(page.getByText(/Added \d+ cards? to your Playground reviews/)).toBeVisible()
  await expect(brief.getByRole('link', { name: 'Review cards' })).toBeVisible()

  // Marking the entry read clears it from the "new" count.
  await page.getByRole('button', { name: /Mark .* as read/ }).click()
  await expect(page.getByRole('button', { name: /Mark .* as new/ })).toBeVisible()
})

test('sources page shows per-source status and the official feeds', async ({ page }) => {
  await page.goto('/radar/sources')
  const rows = page.getByTestId('radar-source')
  await expect(rows).toHaveCount(7)
  await expect(rows.filter({ hasText: 'Hugging Face Hub' })).toContainText('Fresh')
  await expect(rows.filter({ hasText: 'arXiv' })).toContainText('Not run yet')
  await expect(page.getByText('OpenAI News')).toBeVisible()
})
