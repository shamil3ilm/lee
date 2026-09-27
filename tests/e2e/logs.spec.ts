import { test, expect } from '@playwright/test'

// Run records + persisted event log (seeded in tests/e2e/seed.ts):
// Settings › Background jobs shows the last run per job type with its
// history; Settings › Logs lists and filters events.

// Keep this spec's page loads out of the per-user vitals rate limit
// (30 beacons/min, in memory) that performance.spec.ts relies on.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/vitals', (route) => route.fulfill({ status: 204 }))
})

test('settings: background jobs shows last runs and a job’s run history', async ({ page }) => {
  await page.goto('/settings/jobs')
  const table = page.getByTestId('last-runs')
  await expect(table).toBeVisible()

  const gmail = table.locator('[data-testid="last-run-row"][data-type="gmail-sync:user"]')
  await expect(gmail).toContainText('Gmail sync')
  await expect(gmail).toContainText('Done')
  await expect(gmail).toContainText('40 checked · 2 matched · 2 logged')
  await expect(gmail).toContainText('3.2 s')

  const digest = table.locator('[data-testid="last-run-row"][data-type="digest:user"]')
  await expect(digest).toContainText('Gave up')
  await expect(digest).toContainText('Gmail send failed: 401')

  await gmail.getByRole('link', { name: 'Gmail sync' }).click()
  await expect(page).toHaveURL(/history=gmail-sync/)
  const history = page.getByTestId('run-history')
  await expect(history.getByRole('listitem').filter({ hasText: 'checked' })).toHaveCount(2)
  await expect(history).toContainText('Attempt 1: Gmail said 503; will retry.')
})

test('settings: logs tab lists events and filters by category, level and text', async ({ page }) => {
  await page.goto('/settings/logs')
  await expect(page.getByRole('heading', { name: 'Logs', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Logs' })).toBeVisible()

  const rows = page.getByTestId('event-row')
  const form = page.getByRole('search', { name: 'Filter logs' })
  await expect(rows.filter({ hasText: 'Gmail synced: 40 checked · 2 matched' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Scheduled 9 job(s)' })).toHaveCount(1)

  // Category filter (plain GET form).
  await form.getByLabel('Category').selectOption('gmail')
  await form.getByRole('button', { name: 'Filter' }).click()
  await expect(page).toHaveURL(/category=gmail/)
  // Other specs may have logged more events: assert on what the filter keeps.
  await expect(rows.filter({ hasText: 'Gmail synced: 40 checked' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Scheduled 9 job(s)' })).toHaveCount(0)
  expect(new Set(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-category'))))).toEqual(
    new Set(['gmail']),
  )

  // Level filter: warnings and errors only.
  await form.getByLabel('Category').selectOption('')
  await form.getByLabel('Level').selectOption('problems')
  await form.getByRole('button', { name: 'Filter' }).click()
  await expect(rows.filter({ hasText: 'Groq 429' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Gmail synced' })).toHaveCount(0)
  for (const level of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-level')))) {
    expect(['warn', 'error']).toContain(level)
  }

  // Text search.
  await form.getByLabel('Level').selectOption('')
  await form.getByLabel('Search').fill('groq')
  await form.getByRole('button', { name: 'Filter' }).click()
  const groq = rows.filter({ hasText: 'Groq 429' })
  await expect(groq).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Gmail synced' })).toHaveCount(0)

  // Expandable context.
  await groq.getByText('Details').click()
  await expect(groq.locator('pre')).toContainText('"category": "ai"')
  await expect(groq.getByRole('button', { name: 'Copy as JSON' })).toBeVisible()
})

test('inline last-run surfaces: sources and discovery header', async ({ page }) => {
  await page.goto('/settings/sources')
  await expect(page.getByTestId('source-last-result').first()).toContainText(/found · \d+ new/)
  await expect(page.getByTestId('source-last-error')).toContainText('HTTP 503 from upstream')

  await page.goto('/discoveries')
  await expect(page.getByText(/Last checked .* · \d+ new/)).toBeVisible()
})
