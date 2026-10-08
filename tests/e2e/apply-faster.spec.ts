import { test, expect, type Page } from '@playwright/test'

// Apply faster: the daily shortlist renders from the seeded snapshot, and
// the Prepare flow runs to "Applied" with the fixture AI (E2E_AI_FIXTURES).
// Acts only on seed rows no other journey reads: the Paylane posting
// (prepared) and the CRED posting (Not for me).

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

const PAYOUTS = 'Backend Engineer, Payouts'
const PLATFORM = 'Platform Engineer (Kubernetes)'

test('shortlist renders with reasons, and Not for me takes a reason', async ({ page }) => {
  await page.goto('/shortlist')
  await expect(page.getByRole('heading', { level: 1, name: 'Shortlist' })).toBeVisible()
  const cards = page.getByTestId('shortlist-card')
  await expect(cards.first()).toBeVisible()

  const payouts = cards.filter({ hasText: PAYOUTS })
  await expect(payouts).toBeVisible()
  // One Fit badge per card; AI 88 and the shortlist's rank parts are in "Why this score".
  await expect(payouts.getByTestId('match-badge')).toContainText(/^Fit \d+/)
  await payouts.getByRole('button', { name: /Why this score/ }).click()
  const why = page.getByTestId('match-why')
  await expect(why.getByRole('list', { name: 'Fit breakdown' })).toContainText('88')
  await expect(why.getByTestId('shortlist-reasons')).toContainText('on today’s shortlist')
  await page.keyboard.press('Escape')
  // The best of the user's variants for this posting (lib/cv-fit).
  await expect(payouts.getByTestId('best-cv')).toContainText('Best CV')

  const platform = cards.filter({ hasText: PLATFORM })
  await platform.getByRole('button', { name: 'Not for me' }).click()
  await page.getByRole('menuitem', { name: 'Wrong kind of role' }).click()
  await expectToast(page, 'Similar roles will rank lower')
  await expect(cards.filter({ hasText: PLATFORM })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Already handled' })).toContainText(PLATFORM)
})

test('prepare application runs to applied with the AI fixtures', async ({ page }) => {
  await page.goto('/shortlist')
  const card = page.getByTestId('shortlist-card').filter({ hasText: PAYOUTS })
  await card.getByRole('button', { name: 'Prepare application' }).click()
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}\/prepare$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Prepare application' })).toBeVisible()
  await expect(page.getByText('Nothing is sent.')).toBeVisible()

  // 1. Résumé variant (the suggested one is preselected).
  const variant = page.getByTestId('prepare-step-variant')
  await variant.getByRole('button', { name: 'Use this résumé' }).click()
  await expect(variant).toHaveAttribute('data-state', 'done')

  // 2. Tailored CV + CV Score delta vs the variant.
  const tailor = page.getByTestId('prepare-step-tailor')
  await tailor.getByRole('button', { name: 'Generate tailored CV' }).click()
  await expect(tailor).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(tailor.getByTestId('cv-score-delta')).toContainText('CV Score')

  // 3. Cover letter.
  const cover = page.getByTestId('prepare-step-cover')
  await cover.getByRole('button', { name: 'Generate cover letter' }).click()
  await expect(cover).toHaveAttribute('data-state', 'done', { timeout: 30_000 })

  // 4. Checklist: where to apply, documents and the posting's question.
  const checklist = page.getByTestId('prepare-step-checklist')
  await expect(checklist).toContainText('Apply on Greenhouse')
  await expect(checklist).toContainText('Cover letter')
  await expect(checklist).toContainText('How have you handled a failed payout end to end?')
  await checklist.getByLabel('Apply on Greenhouse').check()
  await checklist.getByRole('button', { name: 'Checklist done' }).click()
  await expect(checklist).toHaveAttribute('data-state', 'done')

  // 5. Mark applied (today) → follow-up nudge scheduled.
  const applied = page.getByTestId('prepare-step-applied')
  await applied.getByRole('button', { name: 'Mark applied' }).click()
  await expectToast(page, 'Marked applied')
  await expect(applied.getByTestId('applied-summary')).toContainText('Follow-up nudge')

  // The stage moved to Applied.
  await page.getByRole('link', { name: 'Application details' }).click()
  await expect(page.getByRole('combobox', { name: 'Application status' })).toHaveText('Applied')

  // Shortlist: the week's apply funnel counts it.
  await page.goto('/shortlist')
  const funnel = page.getByTestId('week-funnel')
  await expect(funnel).toBeVisible()
  await expect(funnel.getByRole('listitem').filter({ hasText: 'Applied' })).not.toContainText(/^0/)
})
