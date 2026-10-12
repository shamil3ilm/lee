import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './ready'

// Settings › Sources bulk selection. The seed has two switched-off JSON-LD
// sources on .example hosts ("Bulk Alpha/Beta careers": a poll fails fast,
// offline) and "YC directory", a kind lee no longer reads. The journey
// turns the two on and back off, so the shared seed is left as it was.

const NAMES = ['Bulk Alpha careers', 'Bulk Beta careers'] as const

async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

async function openSources(page: Page): Promise<void> {
  await page.goto('/settings/sources#your-sources')
  await waitForHydration(page)
  await expect(page.getByTestId('sources-select-all')).toBeVisible()
}

async function selectBulkRows(page: Page): Promise<void> {
  for (const n of NAMES) await page.getByRole('checkbox', { name: `Select ${n}` }).check()
}

test('select the switched-off sources → Turn on → rows on, one poll queued per source', async ({ page }) => {
  await openSources(page)
  const section = page.locator('#your-sources')
  await section.getByTestId('sources-pick-off').click()

  const bar = page.getByTestId('sources-bulk-bar')
  await expect(bar).toBeVisible()
  await expect(section.getByTestId('sources-select-all')).toHaveJSProperty('indeterminate', true)
  // YC directory can't be polled: excluded from Turn on, with the reason.
  await expect(bar.getByTestId('sources-bulk-blocked')).toContainText("lee doesn't read this kind of source any more (YC directory)")
  const turnOn = bar.getByTestId('sources-bulk-on')
  await expect(turnOn).toHaveText(/Turn on 2/)

  await turnOn.click()
  await expectToast(page, 'Turned on 2 sources · 2 checks queued')
  for (const n of NAMES) await expect(section.getByRole('switch', { name: `Poll ${n}` })).toBeChecked()
  await expect(bar).toBeHidden()

  // One poll per source: checking again within the hour never adds a second.
  await selectBulkRows(page)
  await bar.getByTestId('sources-bulk-check').click()
  await expectToast(page, /2 sources: /)
  await selectBulkRows(page)
  await bar.getByTestId('sources-bulk-check').click()
  await expectToast(page, /2 sources: (already queued: 2 checks, one per source|already checked this hour)/)

  // Back off, as seeded.
  await selectBulkRows(page)
  await bar.getByTestId('sources-bulk-off').click()
  await expectToast(page, 'Turned off 2 sources')
  for (const n of NAMES) await expect(section.getByRole('switch', { name: `Poll ${n}` })).not.toBeChecked()
})

test('select all works from the keyboard and Escape clears the selection', async ({ page }) => {
  await openSources(page)
  const all = page.getByTestId('sources-select-all')
  await all.focus()
  await page.keyboard.press('Space')
  await expect(all).toBeChecked()
  await expect(page.getByText(/^\d+ of \d+ selected$/).first()).toBeVisible()
  const bar = page.getByTestId('sources-bulk-bar')
  await expect(bar.getByRole('button', { name: /^Check now: \d+ sources?$/ })).toBeVisible()
  await bar.getByRole('button', { name: 'Clear' }).focus()
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
  await expect(all).not.toBeChecked()
})

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
] as const) {
  test.describe(`bulk bar at ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })
    test(`fits without horizontal scroll (${vp.name})`, async ({ page }) => {
      await openSources(page)
      await page.getByTestId('sources-pick-all').click()
      const bar = page.getByTestId('sources-bulk-bar')
      await expect(bar).toBeVisible()
      const box = await bar.boundingBox()
      expect(box).not.toBeNull()
      if (vp.name === 'phone') {
        // A bottom bar on phones: full width, flush with the bottom edge.
        expect(Math.round(box!.y + box!.height)).toBe(vp.height)
        expect(Math.round(box!.width)).toBe(vp.width)
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      const dir = path.resolve('.e2e/screens')
      await mkdir(dir, { recursive: true })
      await page.screenshot({ path: path.join(dir, `sources-bulk-${vp.width}.png`) })
    })
  })
}
