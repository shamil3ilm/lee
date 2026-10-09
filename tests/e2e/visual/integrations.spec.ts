import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Visual QA for Connect GitHub / LinkedIn and Settings › LinkedIn (opt-in
// with `pnpm e2e:screens`): phone, tablet and desktop, light and dark;
// nothing may spill past the viewport.

const OUT = path.resolve('.e2e/screens')
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme} integrations`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      test('Settings › Integrations and Settings › LinkedIn', async ({ page }) => {
        await mkdir(OUT, { recursive: true })
        await page.goto('/settings/integrations')
        await expect(page.locator('#github')).toBeVisible()
        await expect(page.locator('#linkedin')).toBeVisible()
        await expectNoHorizontalOverflow(page)
        await page.locator('#github').scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-integrations.png`), fullPage: true })

        await page.goto('/settings/linkedin')
        await expect(page.locator('#linkedin-composer')).toBeVisible()
        await expectNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-linkedin.png`), fullPage: true })

        await page.goto('/settings/resume#resume-github')
        await expect(page.locator('#resume-github')).toBeVisible()
        await expectNoHorizontalOverflow(page)
        await page.locator('#resume-github').screenshot({ path: path.join(OUT, `${vp.name}-${theme}-resume-github.png`) })
      })
    })
  }
}
