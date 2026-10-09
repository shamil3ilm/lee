import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Visual QA for Discovery › Companies (opt-in with `pnpm e2e:screens`): the
// list with filters and directories, the Reach out dialog and the starred
// regions field, at phone, tablet and desktop, light and dark; nothing may
// spill past the viewport.

const OUT = path.resolve('.e2e/screens')
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

async function noOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme} companies`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      test('Companies tab, Reach out and starred regions', async ({ page }) => {
        await mkdir(OUT, { recursive: true })
        await page.goto('/discoveries?tab=companies')
        await expect(page.getByTestId('company-card').first()).toBeVisible()
        await page.getByTestId('browse-directories').locator('summary').click()
        await noOverflow(page)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-companies.png`), fullPage: true })

        await page.getByTestId('growth-chip').first().click()
        await expect(page.getByTestId('growth-why')).toBeVisible()
        await noOverflow(page)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-companies-growth.png`) })
        await page.keyboard.press('Escape')

        await page.getByTestId('company-card').nth(1).getByTestId('reach-out').click()
        await expect(page.getByTestId('reach-out-body')).not.toHaveValue('')
        const box = await page.getByRole('dialog').first().boundingBox()
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-companies-reach-out.png`) })
        await page.keyboard.press('Escape')

        await page.goto('/settings/search')
        await page.getByTestId('preferred-regions').locator('[data-star="kw"]').click()
        await page.getByTestId('preferred-regions').locator('[data-star="ae"]').click()
        await page.getByTestId('preferred-regions').scrollIntoViewIfNeeded()
        await noOverflow(page)
        await page.getByTestId('preferred-regions').screenshot({ path: path.join(OUT, `${vp.name}-${theme}-preferred-regions.png`) })
      })
    })
  }
}
