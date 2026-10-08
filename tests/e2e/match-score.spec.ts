import { test, expect } from '@playwright/test'

// The deterministic Match Score: every discovery carries a badge with a
// colour band, and "Why this score" lists the components and the missing
// must-haves. Read-only: no seeded row changes state.

// The Ledger posting stays in the inbox through the other journeys; its
// stack matches the seeded profile (missing must-haves: unit tests).
const LEDGER_ROLE = 'Senior Backend Engineer, Ledger'

test('list rows show one Fit badge with a "Why this score" popover', async ({ page }) => {
  await page.goto('/discoveries')
  const row = page.locator('[data-slot="card"]').filter({ hasText: LEDGER_ROLE })
  const badge = row.getByTestId('match-badge')
  // One number: Fit, the blend of the Match Score and the seeded AI score.
  await expect(badge).toContainText(/^Fit \d+$/)
  await expect(badge).toHaveAttribute('data-band', /^(strong|good|fair|weak)$/)

  await row.getByRole('button', { name: /Why this score/ }).click()
  const why = page.getByTestId('match-why')
  await expect(why).toBeVisible()
  await expect(why).toContainText('Why this score')
  await expect(why.getByRole('list', { name: 'Fit breakdown' })).toContainText('91')
  await expect(why.getByTestId('fit-formula')).toContainText('Fit = (Match + AI)')
  await expect(why.getByRole('list', { name: 'Score components' })).toContainText('Skills')
  await expect(why.getByRole('list', { name: 'Score components' })).toContainText('Seniority')
  await expect(why.getByRole('list', { name: 'Score components' })).toContainText('Region: India')
  // Visual QA (`pnpm e2e:screens` sets E2E_SCREENS): keep the open popover.
  if (process.env.E2E_SCREENS) await page.screenshot({ path: '.e2e/screens/match-why.png' })
  await page.keyboard.press('Escape')
  await expect(why).toBeHidden()
})

test('Best fit sort and the minimum-Fit filter use the score', async ({ page }) => {
  await page.goto('/discoveries')
  await page.getByLabel('Sort').selectOption('match')
  await expect(page).toHaveURL(/sort=match/)
  await expect(page.getByTestId('match-badge').first()).toContainText(/Fit \d+/)

  await page.goto('/discoveries?minScore=100')
  await expect(page.getByTestId('match-badge')).toHaveCount(0)
})

test('board cards carry the badge and the popover', async ({ page }) => {
  await page.goto('/discoveries?view=board')
  // Wait for the drag-and-drop layer to replace the static first paint.
  await expect(page.locator('[id^="DndLiveRegion"]')).toHaveCount(1)
  const card = page.locator('[data-board-card]').filter({ hasText: LEDGER_ROLE })
  await expect(card.getByTestId('match-badge')).toContainText(/Fit \d+/)
  await card.getByRole('button', { name: /Why this score/ }).click()
  await expect(page.getByTestId('match-why')).toBeVisible()
})
