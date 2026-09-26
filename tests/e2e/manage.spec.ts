import { test, expect, type Page } from '@playwright/test'

// Management journeys: create → edit → delete a contact, and edit a
// discovery source. They act on rows no other journey reads (a contact they
// create themselves; the seeded Greenhouse source's name/slug).

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

test('contact: create → edit → delete', async ({ page }) => {
  const name = `Journey Contact ${Date.now()}`

  await page.goto('/contacts')
  await page.getByRole('button', { name: 'Add contact' }).first().click()
  const add = page.getByRole('dialog', { name: 'Add contact' })
  await add.getByLabel(/^Name/).fill(name)
  await add.getByLabel('Role').fill('Recruiter')
  await add.getByLabel('Email').fill('journey@example.com')
  await add.getByRole('button', { name: 'Add contact' }).click()
  await expectToast(page, 'Contact added')
  await expect(add).toBeHidden()
  const card = page.getByRole('listitem').filter({ hasText: name })
  await expect(card).toContainText('Recruiter')

  // Edit.
  await card.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit contact' })
  await expect(edit.getByLabel(/^Name/)).toHaveValue(name)
  await edit.getByLabel('Role').fill('Hiring Manager')
  await edit.getByLabel('Phone').fill('+971 50 111 2222')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Contact updated')
  await expect(edit).toBeHidden()
  await expect(card).toContainText('Hiring Manager')

  // Persisted across a reload, and the edit form shows the saved values.
  await page.reload()
  const reloaded = page.getByRole('listitem').filter({ hasText: name })
  await expect(reloaded).toContainText('Hiring Manager')
  await reloaded.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit contact' }).getByLabel('Phone')).toHaveValue(
    '+971 50 111 2222',
  )
  await page.keyboard.press('Escape')

  // Delete — confirm step inside the app, Cancel keeps it.
  await reloaded.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const confirm = page.getByRole('dialog', { name: `Delete ${name}?` })
  await expect(confirm).toContainText('unlinked')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(reloaded).toBeVisible()

  await reloaded.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: `Delete ${name}?` }).getByRole('button', { name: 'Delete' }).click()
  await expectToast(page, 'Contact deleted')
  await expect(page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0)

  await page.reload()
  await expect(page.getByText(name)).toHaveCount(0)
})

test('source: edit name and board slug', async ({ page }) => {
  await page.goto('/settings/sources')
  const original = 'Greenhouse — Postman'
  await page.getByRole('button', { name: `Actions for ${original}` }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()

  const dialog = page.getByRole('dialog', { name: 'Edit source' })
  await expect(dialog.getByLabel('Display name')).toHaveValue(original)
  await dialog.getByLabel('Display name').fill('Postman careers')
  await dialog.getByLabel(/Board slug/).fill('postman-labs')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Source updated')
  await expect(dialog).toBeHidden()

  await expect(page.getByText('Postman careers')).toBeVisible()
  await expect(page.getByText('company: postman-labs')).toBeVisible()

  // Persisted, and the edit form reflects it.
  await page.reload()
  await page.getByRole('button', { name: 'Actions for Postman careers' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit source' }).getByLabel(/Board slug/)).toHaveValue(
    'postman-labs',
  )
})

test('application: edit job details, link and unlink a contact', async ({ page }) => {
  await page.goto('/applications')
  await page.getByRole('link', { name: /Senior Engineer, Wallet/ }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Senior Engineer, Wallet' })).toBeVisible()

  await page.getByRole('button', { name: 'Edit details' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit job details' })
  await edit.getByLabel(/^Title/).fill('Staff Engineer, Wallet')
  await edit.getByLabel('Location').fill('Dubai (hybrid)')
  await edit.getByLabel('Salary min').fill('300000')
  await edit.getByLabel('Salary max').fill('400000')
  await edit.getByLabel('Currency').fill('aed')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Job details saved')
  await expect(page.getByRole('heading', { level: 1, name: 'Staff Engineer, Wallet' })).toBeVisible()
  await expect(page.getByText('Dubai (hybrid)')).toBeVisible()
  // Grouping follows the server locale (en-IN renders 3,00,000).
  await expect(page.getByText(/AED 3,?00,000 – 4,?00,000/)).toBeVisible()

  // Link a contact, then unlink.
  const card = page.locator('div.rounded-lg.border').filter({ hasText: 'Points of contact' }).last()
  await card.getByRole('button', { name: 'Link contact' }).click()
  const link = page.getByRole('dialog', { name: 'Link a contact' })
  await link.getByRole('combobox', { name: 'Contact' }).click()
  await page.getByRole('option', { name: 'Sara Haddad' }).click()
  await link.getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: 'Interviewer' }).click()
  await link.getByRole('button', { name: 'Link', exact: true }).click()
  await expectToast(page, 'Contact linked')
  await expect(card.getByText('Sara Haddad')).toBeVisible()

  await card.getByRole('button', { name: 'Unlink Sara Haddad' }).click()
  await expectToast(page, 'Sara Haddad unlinked')
  await expect(card.getByText('Sara Haddad')).toHaveCount(0)
})

test('settings: background jobs shows status and runs due jobs on demand', async ({ page }) => {
  await page.goto('/settings/jobs')
  await expect(page.getByRole('heading', { name: 'Background jobs' })).toBeVisible()
  await expect(page.getByTestId('job-counts')).toContainText('Queued')
  await expect(page.getByText('Recent failures')).toBeVisible()
  await page.getByRole('button', { name: 'Run now' }).click()
  await expectToast(page, /Nothing was due|Ran \d+ job/)
})
