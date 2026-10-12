import { test, expect } from '@playwright/test'

// Discovery header, board and sidebar after the 2026-10-10 product review:
// outcome counts in the subtitle, one toolbar row, empty board columns as
// slim rails, "In pipeline" for the saved column, reason chips on cards, and
// the side projects behind Settings › Labs. The Labs test puts the switch
// back the way it found it.

test('the subtitle reports outcomes with links, and the header is one toolbar row', async ({ page }) => {
  await page.goto('/discoveries')
  const counts = page.getByTestId('discovery-counts')
  await expect(counts).toContainText(/\d+ fetched · \d+ to triage · \d+ filtered/)
  await expect(counts.locator('[data-count="filtered"]')).toHaveAttribute('href', '/discoveries?tab=jobs&status=filtered&view=list')
  // Secondary actions live in the "⋯" menu.
  await page.getByRole('button', { name: 'More Discovery actions' }).click()
  await expect(page.getByRole('menuitem', { name: /Search with Google AI Mode/ })).toBeVisible()
  await page.keyboard.press('Escape')

  const toolbar = page.getByTestId('discovery-toolbar')
  await expect(toolbar.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page')
  await expect(toolbar.getByRole('group', { name: 'View' })).toBeVisible()
  await expect(toolbar.getByTestId('more-filters')).toBeVisible()
})

test('board: empty columns rail with their count, "In pipeline" names the saved column, cards carry the reason', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/discoveries?view=board')
  const board = page.locator('[data-board="discoveries"]')
  await expect(board).toBeVisible()
  const pipeline = board.locator('[data-board-column="saved"]')
  await expect(pipeline.getByRole('heading', { name: 'In pipeline' })).toBeVisible()
  await expect(board.getByText('Applied', { exact: true })).toHaveCount(0)
  // Shortlisted is empty in the seed: a slim rail, still expandable.
  const shortlisted = board.locator('[data-board-column="shortlisted"]')
  await expect(shortlisted).toHaveAttribute('data-collapsed', 'empty')
  await expect(shortlisted).toContainText('0')
  // Dismissed stays collapsed.
  await expect(board.locator('[data-board-column="dismissed"]')).toHaveAttribute('data-collapsed', /.*/)
  // A title-only posting says so on its card, like the list row.
  await expect(board.locator('[data-board-card]').getByTestId('reason-chip').first()).toBeVisible()
})

test('a region with nothing to triage: one empty state that says why, region shown once, coverage about it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  // The seed's Saudi posting (Riyadh) is dismissed: nothing to triage there.
  await page.goto('/discoveries?region=sa&view=board')
  await expect(page.locator('[data-board="discoveries"]')).toHaveCount(0)
  const empty = page.getByTestId('empty-discovery')
  await expect(empty.getByRole('heading', { name: 'No jobs to triage in Saudi Arabia yet' })).toBeVisible()
  await expect(empty.getByTestId('empty-discovery-why')).toContainText(/\d+ dismissed/)
  await expect(empty.getByRole('link', { name: /dismissed/ })).toHaveAttribute('href', /status=dismissed.*region=sa/)
  await expect(empty.getByTestId('run-sources-now')).toBeVisible()
  await expect(empty.getByRole('link', { name: 'Coverage for Saudi Arabia' })).toBeVisible()
  await expect(empty.getByRole('link', { name: 'Clear the region filter' })).not.toHaveAttribute('href', /region=/)
  // The filter shows the selection once: no second "Saudi Arabia ×" chip.
  await expect(page.getByTestId('region-filter')).toContainText('Saudi Arabia')
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0)

  // The list says the same, and the coverage line is about the filtered region.
  await page.goto('/discoveries?region=sa&view=list')
  await expect(page.getByTestId('empty-discovery')).toBeVisible()
  await expect(page.getByTestId('coverage-line')).toContainText('Saudi Arabia')
})

test('Settings › Labs shows or hides the side projects in the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/settings/labs')
  const sw = page.getByRole('switch', { name: 'Show Labs in the sidebar' })
  const nav = page.getByRole('navigation', { name: 'Main' })
  const wasOn = await sw.isChecked()

  await sw.uncheck({ force: true })
  await expect(nav.getByRole('link', { name: 'Playground' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Expenses' })).toHaveCount(0)

  await sw.check({ force: true })
  await expect(nav.getByRole('link', { name: 'Playground' })).toBeVisible()
  // Nothing is clipped under the footer at 1280×900, even with Labs on.
  const expenses = nav.getByRole('link', { name: 'Expenses' })
  await expenses.scrollIntoViewIfNeeded()
  const box = await expenses.boundingBox()
  const footer = await page.locator('aside footer').first().boundingBox()
  expect(box && footer && box.y + box.height <= footer.y).toBeTruthy()

  if (!wasOn) await sw.uncheck({ force: true })
})
