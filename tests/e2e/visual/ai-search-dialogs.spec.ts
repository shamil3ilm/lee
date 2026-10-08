import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Visual QA for the AI Mode and "Add from text or link" dialogs (opt-in with
// `pnpm e2e:screens`): screenshots at phone, tablet and desktop, light and
// dark, and a check that no dialog spills past the viewport.

const OUT = path.resolve('.e2e/screens')
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

async function expectInsideViewport(page: Page, width: number): Promise<void> {
  const box = await page.getByRole('dialog').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme} ai-search dialogs`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      test('AI Mode and paste-import dialogs', async ({ page }) => {
        await mkdir(OUT, { recursive: true })
        await page.goto('/discoveries')
        await page.getByTestId('ai-mode-trigger').click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectInsideViewport(page, vp.width)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-dialog-ai-mode.png`) })
        await page.keyboard.press('Escape')

        await page.getByTestId('paste-import-trigger').click()
        await page.getByTestId('paste-import-text').fill(
          'Integration Engineer at Visual Sample Co (Dubai) https://careers.visual-sample.example/jobs/1\n' +
            'Data Analyst — Visual Sample Bank — Riyadh — https://www.linkedin.com/jobs/view/1234567890',
        )
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-dialog-paste.png`) })
        await page.getByTestId('paste-import-find').click()
        await expect(page.getByTestId('paste-import-row')).toHaveCount(2)
        await expectInsideViewport(page, vp.width)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-dialog-paste-review.png`) })
      })
    })
  }
}
