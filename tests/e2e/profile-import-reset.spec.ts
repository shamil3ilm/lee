import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './ready'
import { syntheticExportZip } from '../fixtures/linkedin-export'

// Per-item import review, Undo last import and the Reset details dialog.
// Public profile facts come from the portfolio (profileEditableInLee() is
// false), so Apply produces portfolio suggestions and saves no public facts.
// The journey undoes its own import; the reset dialog is cancelled, so later
// specs keep the seeded data. Synthetic names only.

test.describe.configure({ mode: 'serial', retries: 0 })

const FILES = {
  'Skills.csv': ['Name', 'Elixir', 'Haskell', 'OCaml', 'Zig'].join('\n'),
  'Projects.csv': ['Title,Description,Url,Started On,Finished On', 'Synthetic Alpha Project,Alpha,,2022,', 'Synthetic Beta Project,Beta,,2023,'].join('\n'),
}

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('untick two skills and one project, apply: they are absent', async ({ page }) => {
  await page.goto('/settings/linkedin')
  await waitForHydration(page)
  await page.getByTestId('linkedin-export-input').setInputFiles({
    name: 'Basic_LinkedInDataExport.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(syntheticExportZip(FILES)),
  })
  const review = page.getByTestId('linkedin-import-review')
  const chips = review.getByTestId('import-skill-chips')
  await expect(chips.getByRole('button', { name: 'Elixir', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The section checkbox is tri-state: all ticked → mixed after unticking.
  const skillsSection = review.getByRole('checkbox', { name: 'Skills: select all' })
  await expect(skillsSection).toBeChecked()
  await chips.getByRole('button', { name: 'Haskell', exact: true }).click()
  await chips.getByRole('button', { name: 'OCaml', exact: true }).click()
  await expect(skillsSection).not.toBeChecked()
  expect(await skillsSection.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true)
  await review.getByRole('checkbox', { name: /^Synthetic Beta Project/ }).uncheck()
  // Readiness defaults to learning; mark one skill "Mine".
  await chips.getByRole('button', { name: 'Mine — I can explain it: Zig' }).click()
  await expect(chips.getByRole('button', { name: 'Mine — I can explain it: Zig' })).toHaveAttribute('aria-pressed', 'true')

  await review.getByTestId('import-apply').click()
  const suggestions = page.getByTestId('portfolio-suggestions')
  await expect(suggestions).toBeVisible()
  const skills = suggestions.getByTestId('portfolio-snippet-skills')
  await expect(skills).toContainText('Elixir')
  await expect(skills).toContainText('Zig')
  await expect(skills).not.toContainText('Haskell')
  await expect(skills).not.toContainText('OCaml')
  const projects = suggestions.getByTestId('portfolio-snippet-projects')
  await expect(projects).toContainText('Synthetic Alpha Project')
  await expect(projects).not.toContainText('Synthetic Beta Project')
  await suggestions.getByRole('button', { name: 'Done' }).click()

  // Nothing public was written: none of them is in the master profile.
  await page.goto('/settings/resume')
  for (const name of ['Haskell', 'OCaml', 'Synthetic Beta Project', 'Elixir']) {
    await expect(page.getByText(name, { exact: true })).toHaveCount(0)
  }
})

test('undo last import from Settings › Profile', async ({ page }) => {
  await page.goto('/settings/profile#reset-details')
  await waitForHydration(page)
  const undo = page.getByTestId('undo-last-import')
  await expect(undo).toContainText('LinkedIn export')
  await undo.getByRole('button', { name: 'Undo last import' }).click()
  await expectToast(page, 'Import undone')
})

test('the reset dialog lists what goes, offers a backup and needs RESET for a full reset', async ({ page }) => {
  await page.goto('/settings/profile#reset-details')
  await waitForHydration(page)
  const panel = page.getByTestId('reset-panel')
  // Public sections come from the portfolio while editing in lee is off.
  await expect(panel.getByRole('checkbox', { name: /^Experience/ })).toBeDisabled()
  await expect(panel.getByText('Comes from your portfolio').first()).toBeVisible()
  const overlay = panel.getByRole('checkbox', { name: /lee’s overlay/ })
  test.skip(await overlay.isDisabled(), 'the seeded profile has no overlay to reset')
  await overlay.check()
  await panel.getByTestId('reset-review').click()

  const dialog = page.getByRole('dialog', { name: 'Reset details' })
  await expect(dialog.getByRole('region', { name: 'What will be removed' })).toContainText('lee’s overlay')
  await expect(dialog.getByRole('list', { name: 'Never touched' })).toContainText('Applications, documents already sent, tailored CVs and discoveries are never touched.')
  const confirm = dialog.getByRole('button', { name: 'Reset selected' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Type RESET to confirm').fill('reset')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Type RESET to confirm').fill('RESET')
  await expect(confirm).toBeEnabled()

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download a backup first' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^lee-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const backup = JSON.parse(readFileSync((await file.path())!, 'utf8')) as { format: string; data: Record<string, unknown> }
  expect(backup.format).toBe('lee-reset-backup/1')
  expect(Object.keys(backup.data)).toEqual(['overlay'])

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})
