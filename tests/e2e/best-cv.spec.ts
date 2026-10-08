import { test, expect, type Page } from '@playwright/test'

// Best CV for each job, Photo advice and Tailor to this JD (lib/cv-fit).
// Reads the Juspay and Hasura cards; prepares only the Ferrolane posting
// ("Backend Engineer, Settlements"), seeded for this spec, because other
// specs need the Juspay posting to stay new in Discovery. The seed has two
// variants: India · Backend and Remote · Backend.

const LEDGER = 'Senior Backend Engineer, Ledger'
// Remote posting still open here (apply-faster prepares Payouts first; journeys saves Webhooks later).
const WEBHOOKS = 'Backend Engineer, Webhooks'
const SETTLEMENTS = 'Backend Engineer, Settlements'

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('shortlist cards show the best CV and the runner-up', async ({ page }) => {
  await page.goto('/shortlist')
  const webhooks = page.getByTestId('shortlist-card').filter({ hasText: WEBHOOKS })
  // A remote posting: the Remote variant wins on region, India is the runner-up.
  await expect(webhooks.getByTestId('best-cv')).toContainText('Best CV: Remote · Backend')
  await expect(webhooks.getByTestId('best-cv')).toContainText('runner-up India · Backend')
  const ledger = page.getByTestId('shortlist-card').filter({ hasText: LEDGER })
  await expect(ledger.getByTestId('best-cv')).toContainText('Best CV: India · Backend')
  // The reasons live in "Why this score".
  await ledger.getByRole('button', { name: /Why this score/ }).click()
  await expect(page.getByTestId('match-why').getByRole('list', { name: 'Why this CV' })).toContainText('India variant for an India job')
  await page.keyboard.press('Escape')
})

test('Use this CV → Prepare step 1 shows photo advice; step 2 tailors with accept / reject and saves', async ({ page }) => {
  await page.goto('/shortlist')
  const settlements = page.getByTestId('shortlist-card').filter({ hasText: SETTLEMENTS })
  await settlements.getByTestId('best-cv').getByRole('button', { name: 'Use this CV' }).click()
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}\/prepare$/)

  // 1. The best CV is in use, with the photo advice for an Indian employer.
  const variant = page.getByTestId('prepare-step-variant')
  await expect(variant).toHaveAttribute('data-state', 'done')
  await expect(variant.getByTestId('best-cv')).toContainText('In use for this application')
  const photo = variant.getByTestId('photo-advice')
  await expect(photo).toContainText('Photo: Avoid')
  await expect(photo).toContainText('India: not needed')

  // 2. Tailor to this JD: checklist, suggestions, gaps.
  const tailor = page.getByTestId('prepare-step-tailor')
  const panel = tailor.getByTestId('tailor-panel')
  await expect(panel.getByTestId('tailor-checklist')).toContainText('PostgreSQL')
  const suggestions = panel.getByTestId('tailor-suggestion')
  expect(await suggestions.count()).toBeGreaterThan(0)
  // Accept the first, reject (leave) the rest; toggling twice rejects again.
  const first = suggestions.first().getByRole('checkbox')
  await first.check()
  await first.uncheck()
  await first.check()
  await panel.getByRole('button', { name: 'Preview before / after' }).click()
  const beforeAfter = panel.getByTestId('tailor-before-after')
  await expect(beforeAfter).toContainText('Must-haves on the CV')
  await expect(beforeAfter.getByTestId('tailor-score-delta')).toContainText('→')

  await panel.getByRole('button', { name: 'Save tailored copy' }).click()
  await expectToast(page, 'Saved the tailored copy')
  await expect(tailor).toHaveAttribute('data-state', 'done')
  await expect(tailor.getByTestId('cv-score-delta')).toContainText('CV Score')
})

test('Settings › Variants shows which CV covers which jobs', async ({ page }) => {
  await page.goto('/settings/variants')
  await expect(page.getByRole('heading', { level: 1, name: 'Résumé variants' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Which CV covers which jobs/ })).toBeVisible()
  await expect(page.getByTestId('variant-matrix')).toContainText('Remote · Backend')
})
