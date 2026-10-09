import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './ready'
import { E2E_LINKEDIN_STUB_URL } from './env'
import { EXPORT_CSVS, syntheticExportZip } from '../fixtures/linkedin-export'

// Connect GitHub and Connect LinkedIn end to end against the local stubs
// (tests/e2e/github-stub.mjs, tests/e2e/linkedin-stub.mjs): connect both,
// import a synthetic LinkedIn export, see a referral hint on a discovery,
// compose and post (only on the click), then disconnect both so later specs
// publish with the fine-grained token as before.

test.describe.configure({ mode: 'serial', retries: 0 })

const LEDGER = 'Senior Backend Engineer, Ledger'

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

async function stubPosts(page: Page): Promise<Array<{ body: Record<string, unknown>; version: string | null }>> {
  const res = await page.request.get(`${E2E_LINKEDIN_STUB_URL}/__test/posts`)
  return ((await res.json()) as { posts: Array<{ body: Record<string, unknown>; version: string | null }> }).posts
}

test('connect GitHub: user authorization with PKCE, installed repos and permissions', async ({ page }) => {
  await page.goto('/settings/integrations')
  await waitForHydration(page)
  await page.getByTestId('github-connect').click()
  await page.waitForURL(/\/settings\/integrations\?github=connected/)
  await expect(page.getByTestId('github-callback-status')).toHaveText('GitHub connected.')
  const card = page.locator('#github')
  await expect(card.getByText('example-asha', { exact: true })).toBeVisible()
  await expect(card.getByText('Contents (read & write)')).toBeVisible()
  await expect(page.getByTestId('github-installed-repos')).toContainText('example-asha/payouts-engine')
  await expect(card.getByRole('link', { name: 'Manage repositories' })).toBeVisible()
  await card.getByRole('button', { name: 'Test' }).click()
  await expectToast(page, 'Connected as example-asha; the app is installed.')
})

test('connect LinkedIn with posting allowed', async ({ page }) => {
  await page.goto('/settings/integrations')
  await waitForHydration(page)
  const card = page.locator('#linkedin')
  await card.getByLabel('Allow posting (Share on LinkedIn)').check()
  await page.getByTestId('linkedin-connect').click()
  await page.waitForURL(/\/settings\/integrations\?linkedin=connected/)
  await expect(page.getByTestId('linkedin-callback-status')).toHaveText('LinkedIn connected.')
  await expect(page.locator('#linkedin').getByText('Asha Example')).toBeVisible()
  await expect(page.getByTestId('linkedin-expiry')).toContainText('Posting: allowed')
})

test('import a LinkedIn export, then see a referral hint on a discovery', async ({ page }) => {
  const files = {
    ...EXPORT_CSVS,
    'Connections.csv': `${EXPORT_CSVS['Connections.csv']}\nPriya,Example,https://www.linkedin.com/in/priya-example,,Juspay Technologies Pvt Ltd,Staff Engineer,10 Feb 2024`,
  }
  await page.goto('/settings/linkedin')
  await waitForHydration(page)
  await page.getByTestId('linkedin-export-input').setInputFiles({
    name: 'Basic_LinkedInDataExport.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(syntheticExportZip(files, 'Basic_LinkedInDataExport_10-09-2026/')),
  })
  const review = page.getByTestId('linkedin-import-review')
  await expect(review).toBeVisible()
  await expect(review.getByText('Software Engineer · Gulf Fintech')).toBeVisible()
  await page.getByTestId('linkedin-import-apply').click()
  await expectToast(page, /saved 4 connections/)
  await expect(page.getByTestId('linkedin-connections')).toContainText('Priya Example')
  await expect(page.getByTestId('linkedin-checklist')).toBeVisible()

  await page.goto('/discoveries')
  await page.getByRole('link', { name: `Details and comparison: ${LEDGER}` }).first().click()
  await page.waitForURL(/\/discoveries\/[0-9a-f-]{36}$/)
  const hint = page.getByTestId('referral-hint')
  await expect(hint).toContainText('You know 1 person at Juspay: Priya Example')
  await waitForHydration(page)
  await hint.getByRole('button', { name: 'Draft a referral ask' }).click()
  await expect(hint.getByRole('textbox')).toHaveValue(/Hi Priya,/)
})

test('compose a post: nothing is sent until Post is clicked', async ({ page }) => {
  await page.goto('/settings/linkedin#linkedin-composer')
  await waitForHydration(page)
  await page.getByLabel('Write about').selectOption({ label: 'Open to work: Open to work announcement' })
  await page.getByTestId('composer-draft').click()
  await expect(page.getByLabel('Post text')).not.toHaveValue('')
  await page.getByTestId('composer-preview').click()
  await expect(page.getByTestId('composer-preview-box')).toBeVisible()
  expect(await stubPosts(page)).toHaveLength(0)
  await page.getByTestId('composer-post').click()
  await expectToast(page, 'Posted to LinkedIn.')
  const posts = await stubPosts(page)
  expect(posts).toHaveLength(1)
  expect(posts[0]!.body).toMatchObject({ author: 'urn:li:person:e2eMember01', visibility: 'PUBLIC', lifecycleState: 'PUBLISHED' })
  expect(posts[0]!.version).toMatch(/^\d{6}$/)
  await expect(page.getByTestId('linkedin-post-history').getByRole('link', { name: 'View on LinkedIn' })).toBeVisible()
})

test('disconnect both', async ({ page }) => {
  await page.goto('/settings/integrations')
  await waitForHydration(page)
  await page.locator('#github').getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expectToast(page, 'GitHub disconnected')
  await expect(page.getByTestId('github-connect')).toBeVisible()
  await page.locator('#linkedin').getByRole('button', { name: 'Disconnect' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expectToast(page, 'LinkedIn disconnected')
  await expect(page.getByTestId('linkedin-connect')).toHaveText('Connect LinkedIn')
})
