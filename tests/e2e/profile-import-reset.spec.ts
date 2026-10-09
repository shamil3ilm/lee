import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './ready'
import { syntheticExportZip } from '../fixtures/linkedin-export'

// Per-item import review, Undo last import and the Reset details dialog.
// The e2e user has no portfolio synced yet, so canEditPublicFacts() is true
// and Apply saves the ticked items to the master profile (the portfolio-
// suggestions path is covered by tests/integration/profile-import-flows).
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
  await expectToast(page, 'Saved 3 items.')

  // Only the ticked items reached the master profile; the unticked ones are absent.
  await page.goto('/settings/resume')
  await waitForHydration(page)
  await expect(page.getByLabel('Elixir kind')).toBeVisible()
  await expect(page.getByLabel('Zig kind')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Synthetic Alpha Project' })).toBeVisible()
  await expect(page.getByLabel('Haskell kind')).toHaveCount(0)
  await expect(page.getByLabel('OCaml kind')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Synthetic Beta Project' })).toHaveCount(0)
})

test('undo last import from Settings › Profile', async ({ page }) => {
  await page.goto('/settings/profile#reset-details')
  await waitForHydration(page)
  const undo = page.getByTestId('undo-last-import')
  await expect(undo).toContainText('LinkedIn export')
  await undo.getByRole('button', { name: 'Undo last import' }).click()
  await expectToast(page, 'Import undone')
  await page.goto('/settings/resume')
  await waitForHydration(page)
  await expect(page.getByLabel('Elixir kind')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Synthetic Alpha Project' })).toHaveCount(0)
})

test('the reset dialog lists what goes, offers a backup and needs RESET for a full reset', async ({ page }) => {
  await page.goto('/settings/profile#reset-details')
  await waitForHydration(page)
  const panel = page.getByTestId('reset-panel')
  // No portfolio synced yet: public sections can be reset in lee.
  await expect(panel.getByRole('checkbox', { name: /^Experience/ })).toBeEnabled()
  // Interview-ready flags reset only with their own box, under the overlay.
  await expect(panel.getByRole('checkbox', { name: /Also reset interview-ready flags/ })).toBeDisabled()
  // A full reset: every master-profile section.
  await panel.getByRole('checkbox', { name: 'All sections' }).check()
  await panel.getByTestId('reset-review').click()

  const dialog = page.getByRole('dialog', { name: 'Reset details' })
  await expect(dialog.getByRole('region', { name: 'What will be removed' })).toContainText('Master profile: Experience')
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
  expect(Object.keys(backup.data)).toEqual(['masterProfile'])

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})
