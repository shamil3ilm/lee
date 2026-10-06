import { test, expect } from '@playwright/test'

// v13 phase 13.0 — the Playground loop end to end: the hub shows today's
// adaptive plan (each item with its reason), one built-in item is answered
// in the workbench, and the history timeline records it. The seeded
// system-design stage (in 2 days) gives the plan an interview-prep item.

test('hub renders a plan, one built-in item is completed, and history shows it', async ({ page }) => {
  await page.goto('/playground')
  await expect(page.getByRole('heading', { name: 'Playground', level: 1 })).toBeVisible()
  const plan = page.getByRole('list', { name: "Today's plan" })
  await expect(plan.getByTestId('plan-item').first()).toBeVisible()
  await expect(plan).toContainText('Why this?')
  await expect(page.getByTestId('stat-rank')).toBeVisible()
  await expect(page.getByText('For your upcoming interview', { exact: true })).toBeVisible()
  await expect(page.getByText('Your study list', { exact: true })).toBeVisible()

  // Prefer the interview-prep item; any practice item proves the loop.
  const interview = plan.getByTestId('plan-item').filter({ hasText: 'Interview prep' }).first()
  const row = (await interview.count()) > 0 ? interview : plan.getByTestId('plan-item').filter({ has: page.getByRole('button', { name: /^Start/ }) }).last()
  await expect(row).toContainText(/Why this\?/)
  const skillTitle = (await row.locator('span.font-medium').first().textContent())?.trim() ?? ''
  await row.getByRole('button', { name: /^Start/ }).click()

  // The workbench: answer and submit.
  await page.waitForURL(/\/playground\/play\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('prompt')).toBeVisible()
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Submit answer' }).click()
  const evaluation = page.getByTestId('evaluation')
  await expect(evaluation).toBeVisible()
  await expect(evaluation).toContainText('composite')
  await expect(evaluation).toContainText('n/a')
  await expect(page.getByText(/^(Correct|Not quite)/).first()).toBeVisible()

  // History lists the attempt with its versions.
  await page.getByRole('link', { name: 'History' }).last().click()
  await page.waitForURL(/\/playground\/history$/)
  const entry = page.getByTestId('history-entry').first()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText('engine 13.0.0')
  if (skillTitle) await expect(page.getByRole('list', { name: 'Attempt history' })).toContainText(skillTitle)

  // Back on the hub the plan item is done.
  await page.goto('/playground')
  await expect(page.getByRole('list', { name: "Today's plan" })).toContainText('Done')
})
