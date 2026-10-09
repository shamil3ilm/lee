import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Visual QA for LinkedIn hiring posts (opt-in with `pnpm e2e:screens`): the
// pasted-post review, a hiring-post card with its Reply dialog, and
// Settings › LinkedIn › Hiring posts, at phone, tablet and desktop, light and
// dark; nothing may spill past the viewport. Synthetic post only.

const OUT = path.resolve('.e2e/screens')
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

const POST = [
  'Layla Haddad',
  'Talent Acquisition Lead at Dune Soft Systems',
  "We're hiring a Laravel Developer in Dubai! 3+ years with PHP and MySQL. Send your CV to careers@dunesoft.example #hiring",
  'https://www.linkedin.com/feed/update/urn:li:activity:7399999999999999400/',
].join('\n')

async function noOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme} linkedin posts`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      test('post review, card, reply dialog and settings', async ({ page }) => {
        await mkdir(OUT, { recursive: true })
        await page.context().route(/linkedin\.com/, (route) => route.abort())
        await page.goto('/discoveries')
        await page.getByTestId('paste-import-trigger').click()
        const dialog = page.getByRole('dialog', { name: 'Add from text or link' })
        await dialog.getByTestId('paste-import-text').fill(POST)
        await dialog.getByTestId('paste-import-find').click()
        await expect(dialog.getByTestId('post-review')).toBeVisible()
        const box = await dialog.boundingBox()
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-post-review.png`) })
        await dialog.getByTestId('post-import-submit').click()
        await expect(dialog).toBeHidden()

        await page.goto('/discoveries?posts=1&filtered=show')
        const card = page.locator('[data-status]').filter({ hasText: 'Laravel Developer' }).first()
        await expect(card).toBeVisible()
        await noOverflow(page)
        await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-hiring-posts.png`), fullPage: true })
        const reply = card.getByTestId('post-reply-trigger')
        if (await reply.isVisible()) {
          await reply.click()
          await expect(page.getByTestId('post-reply-body')).not.toHaveValue('')
          const r = await page.getByRole('dialog').first().boundingBox()
          expect(r!.x + r!.width).toBeLessThanOrEqual(vp.width + 1)
          await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-post-reply.png`) })
          await page.keyboard.press('Escape')
        }

        await page.goto('/settings/linkedin#linkedin-hiring-posts')
        await expect(page.getByTestId('hiring-posts-panel')).toBeVisible()
        await noOverflow(page)
        await page.getByTestId('hiring-posts-panel').screenshot({ path: path.join(OUT, `${vp.name}-${theme}-settings-hiring-posts.png`) })
      })
    })
  }
}
