import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Visual QA for the region picker (opt-in with `pnpm e2e:screens`): the
// Discovery filter and the Settings › Search picker, open, at phone, tablet
// and desktop, light and dark; nothing may spill past the viewport.

const OUT = path.resolve('.e2e/screens')
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

async function expectInsideViewport(page: Page, width: number): Promise<void> {
  const box = await page.getByRole('dialog').first().boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme} region picker`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      test('Discovery filter and Settings picker', async ({ page }) => {
        await mkdir(OUT, { recursive: true })
        await page.goto('/discoveries?status=dismissed&region=kerala,dubai&by=region')
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-regions-toolbar.png`), fullPage: true })
        await page.getByTestId('region-filter').click()
        await expect(page.getByTestId('region-tree').first()).toBeVisible()
        await expectInsideViewport(page, vp.width)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-regions-picker.png`) })
        await page.getByRole('dialog').first().getByRole('searchbox').fill('cochin')
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-regions-search.png`) })
        await page.keyboard.press('Escape')

        await page.goto('/settings/search')
        await page.getByTestId('target-regions-picker').click()
        await expect(page.getByTestId('region-tree').first()).toBeVisible()
        await expectInsideViewport(page, vp.width)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-regions-settings.png`) })
      })
    })
  }
}
