import { test, expect, type Page } from '@playwright/test'

// v17 §9.1 — end-to-end journeys against the seeded E2E identity
// (tests/e2e/seed-data.ts). Each journey acts on seed rows no other journey
// touches, so the suite is order-independent within one seeded server.

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

async function setStatus(page: Page, label: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Application status' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await expectToast(page, `Moved to ${label}`)
  await expect(page.getByRole('combobox', { name: 'Application status' })).toHaveText(label)
}

test('find → save discovery → apply → interview stage → offer', async ({ page }) => {
  const title = 'Backend Engineer, Webhooks'

  // Find: the seeded discovery is in the "new" inbox.
  await page.goto('/discoveries')
  const card = page.locator('[data-slot="card"]').filter({ hasText: title }).last()
  await expect(card).toBeVisible()

  // Save → promoted to an application in the pipeline.
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expectToast(page, 'Saved to pipeline')

  await page.goto('/applications')
  await page.getByRole('link', { name: new RegExp(title) }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Application status' })).toHaveText('Saved')

  // Apply.
  await setStatus(page, 'Applied')

  // Add an interview stage.
  await page.getByRole('button', { name: 'Add stage' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add interview stage' })
  await dialog.getByRole('combobox', { name: 'Kind' }).click()
  await page.getByRole('option', { name: 'Technical', exact: true }).click()
  await dialog.getByLabel('Title (optional)').fill('Technical deep dive')
  await dialog.getByLabel('Scheduled').fill('2030-01-15T10:00')
  await dialog.getByLabel('Duration (min)').fill('60')
  await dialog.getByRole('button', { name: 'Add stage' }).click()
  await expectToast(page, 'Stage added')
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Technical deep dive').first()).toBeVisible()

  // Interview → offer.
  await setStatus(page, 'Interview')
  await setStatus(page, 'Offer')

  // Persisted: survives a reload.
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Application status' })).toHaveText('Offer')
  await expect(page.getByText('Technical deep dive').first()).toBeVisible()
})

test('CV score from an application CV fit card', async ({ page }) => {
  await page.goto('/applications')
  await page.getByRole('link', { name: /Senior Backend Developer, Jira Platform/ }).first().click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Senior Backend Developer, Jira Platform' }),
  ).toBeVisible()

  const fitCard = page.locator('[data-slot="card"]').filter({ hasText: 'CV fit' }).last()
  await expect(fitCard.getByText('Not scored yet.')).toBeVisible()
  await fitCard.getByRole('button', { name: 'Score now' }).click()
  await expectToast(page, /Scored \d+\/100/)

  // The card now shows a result and offers a re-score.
  await expect(fitCard.getByRole('button', { name: 'Score again' })).toBeVisible()
  await expect(fitCard.getByText('Not scored yet.')).toBeHidden()
  await expect(fitCard.getByText(/Scored: /)).toBeVisible()
})

test.describe('desktop sidebar', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('group collapse and rail mode persist across reload', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('complementary')
    const shell = page.locator('#app-shell')

    // Collapse the Insights group.
    const insights = nav.getByRole('button', { name: 'Insights' })
    await expect(insights).toHaveAttribute('aria-expanded', 'true')
    await expect(nav.getByRole('link', { name: 'Analytics' })).toBeVisible()
    await insights.click()
    await expect(insights).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('link', { name: 'Analytics' })).toBeHidden()

    // Rail mode.
    await nav.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(shell).toHaveAttribute('data-sidebar', 'rail')

    await page.reload()
    await expect(shell).toHaveAttribute('data-sidebar', 'rail')
    await expect(nav.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()

    // Leaving rail mode restores the persisted group state.
    await nav.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(shell).not.toHaveAttribute('data-sidebar', 'rail')
    await expect(nav.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('link', { name: 'Analytics' })).toBeHidden()

    await page.reload()
    await expect(shell).not.toHaveAttribute('data-sidebar', 'rail')
    await expect(nav.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('opens and navigates', async ({ page }) => {
    await page.goto('/')
    // The desktop sidebar is hidden on phones.
    await expect(page.getByRole('complementary')).toBeHidden()

    await page.getByRole('button', { name: 'Open navigation' }).click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('link', { name: 'Contacts' }).click()

    await expect(page).toHaveURL(/\/contacts$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible()
    await expect(drawer).toBeHidden()
  })
})
