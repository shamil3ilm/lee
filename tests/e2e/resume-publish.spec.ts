import { test, expect, type Page } from '@playwright/test'
import { E2E_GITHUB_STUB_URL } from './env'

// Master profile → variant → publish, end to end. The seeded legacy master
// CV is migrated into the master profile on first visit; Publish talks to
// tests/e2e/github-stub.mjs (GITHUB_API_URL), never to GitHub.

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

async function stubFile(page: Page): Promise<{ text: string | null; commits: number }> {
  const res = await page.request.get(`${E2E_GITHUB_STUB_URL}/__test/file`)
  return (await res.json()) as { text: string | null; commits: number }
}

test('edit the master profile, build a variant, preview it and publish to the portfolio', async ({ page }) => {
  // 1. Résumé: the legacy master CV arrives as the master profile.
  await page.goto('/settings/profile/resume')
  await expect(page.getByRole('heading', { name: 'Résumé', level: 1 })).toBeVisible()
  await expect(page.locator('#basics-name')).toHaveValue('Asha Menon')
  await page.locator('#basics-url').fill('https://asha.example.dev')
  await page.getByLabel('Education 1 area').fill('Computer Science')
  await page.locator('#pf-canonical').fill('https://asha.example.dev/profile.json')
  await page.locator('#qv-role').fill('Backend Engineer')
  await page.locator('#qv-line').fill('Payments and ledgers in Go.')
  await page.locator('#qv-skills').fill('Go, PostgreSQL')
  await page.getByRole('button', { name: 'Add result' }).click()

  // A wording that changes a number is refused; a fact-locked one is kept.
  const wording = page.getByLabel('New wording').first()
  await wording.fill('Idempotent payouts API in Go: 5M requests per day')
  await expect(page.getByText('Numbers not in the original: 5m').first()).toBeVisible()
  await wording.fill('Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await page.getByRole('button', { name: 'Save profile' }).first().click()
  await expectToast(page, /Profile saved/)

  // 2. Variant: GCC × Backend, preview, pick the wording, save a version.
  await page.goto('/settings/profile/variants')
  await page.getByLabel('Region').selectOption('gcc')
  // Role presets come from accepted role families; other specs may have
  // cleared them, so use Backend when offered and General otherwise.
  const role = page.getByLabel('Role')
  const offered = await role.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
  await role.selectOption(offered.includes('backend') ? 'backend' : '')
  await page.getByRole('button', { name: 'Create variant' }).click()
  await page.waitForURL(/\/settings\/profile\/variants\/[0-9a-f-]{36}$/)
  const preview = page.getByTestId('variant-preview')
  await expect(preview.getByRole('heading', { name: 'Asha Menon' })).toBeVisible()
  await expect(preview).toContainText('Add your Arabic level')
  await page.getByLabel(/^Wording for: Designed an idempotent payouts/).selectOption({ label: 'Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability' })
  await expect(preview).toContainText('Idempotent payouts API in Go at 2M+ requests per day and 99.99% availability')
  await page.getByRole('button', { name: 'Save variant' }).click()
  await expectToast(page, 'Saved as version 2')
  await expect(page.getByLabel('Plain-text résumé')).toHaveValue(/ASHA MENON/)

  // 3. Publish: repository, token (checked against the stub), preview, publish.
  await page.goto('/settings/profile/publish')
  const repo = page.getByRole('form', { name: 'Portfolio repository' })
  await repo.getByLabel(/Repository/).fill('example-asha/portfolio')
  await repo.getByRole('button', { name: 'Save' }).click()
  await expectToast(page, 'Repository saved')
  await page.getByLabel('GitHub token').fill('github_pat_e2e_synthetic_token_0000000000')
  await page.getByRole('button', { name: 'Save', exact: true }).nth(1).click()
  await expectToast(page, 'Token saved')
  await expect(page.getByRole('list', { name: 'Token check' })).toContainText('Contents: read')

  await page.reload()
  await expect(page.getByText('Passes the portfolio build’s checks.')).toBeVisible()
  await page.getByText('Show profile.json').click()
  await expect(page.getByTestId('preview-json')).toContainText('"name": "Asha Menon"')
  await expect(page.getByTestId('preview-json')).not.toContainText('+91 90000 00000')

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, 'Published 1.0.0')
  await expect(page.getByTestId('publish-status')).toContainText('Published')
  await expect(page.getByTestId('publish-status').getByRole('link', { name: 'view commit' })).toBeVisible()
  let file = await stubFile(page)
  expect(file.commits).toBe(1)
  expect(file.text).toContain('"canonical": "https://asha.example.dev/profile.json"')
  expect(file.text).not.toContain('+91 90000 00000')

  // 4. A hand edit on GitHub is never overwritten silently.
  const edited = file.text!.replace('"label": "Senior Backend Engineer"', '"label": "Backend Engineer (edited on GitHub)"')
  await page.request.post(`${E2E_GITHUB_STUB_URL}/__test/edit`, { data: edited, headers: { 'content-type': 'text/plain' } })
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  const conflict = page.getByRole('region', { name: 'Changes in the repository' })
  await expect(conflict).toContainText('edited outside lee')
  await expect(conflict).toContainText('Backend Engineer (edited on GitHub)')
  await conflict.getByRole('group', { name: 'Basics' }).getByLabel('Take the repo’s').check()
  await conflict.getByRole('button', { name: 'Publish with these choices' }).click()
  // Taking the repo's basics makes lee match the file: nothing left to commit.
  await expectToast(page, 'Already up to date')
  file = await stubFile(page)
  expect(file.commits).toBe(1)
  // …and the hand edit is now a lee fact, so the next publish keeps it.
  await page.goto('/settings/profile/resume')
  await expect(page.locator('#basics-label')).toHaveValue('Backend Engineer (edited on GitHub)')
  await page.locator('#basics-label').fill('Payments Backend Engineer')
  await page.getByRole('button', { name: 'Save profile' }).first().click()
  await expectToast(page, /Profile saved/)
  await page.goto('/settings/profile/publish')
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, 'Published 1.0.1')
  file = await stubFile(page)
  expect(file.commits).toBe(2)
  expect(file.text).toContain('"label": "Payments Backend Engineer"')
})
