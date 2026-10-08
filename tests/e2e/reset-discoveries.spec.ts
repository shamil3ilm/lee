import { test, expect } from '@playwright/test'

// "Reset discoveries": the dialog from Discovery's overflow menu and from
// Settings › Storage explains what happens and guards the scope. Read-only:
// the dialog is cancelled, so later journeys keep the seeded inbox.

test('the reset dialog lists what happens and needs a source when scoped', async ({ page }) => {
  await page.goto('/discoveries')
  await page.getByRole('button', { name: 'More Discovery actions' }).click()
  await page.getByRole('menuitem', { name: 'Reset discoveries…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reset discoveries' })
  await expect(dialog).toBeVisible()
  const happens = dialog.getByRole('list', { name: 'What happens' })
  await expect(happens).toContainText('Saved jobs, applications and anything you are preparing are never removed.')
  await expect(dialog.getByLabel('Allow re-import')).toBeChecked()
  await expect(dialog.getByLabel('Also remove shortlisted postings I have not acted on')).not.toBeChecked()

  await dialog.getByLabel('Selected sources').check()
  await expect(dialog.getByRole('button', { name: 'Reset discoveries' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/settings/storage')
  await page.getByTestId('storage-reset-discoveries').getByRole('button', { name: 'Reset discoveries…' }).click()
  await expect(page.getByRole('dialog', { name: 'Reset discoveries' })).toBeVisible()
  await page.keyboard.press('Escape')
})
