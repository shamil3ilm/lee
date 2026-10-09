import { test, expect, type Locator, type Page } from '@playwright/test'

// LinkedIn hiring posts, end to end and offline:
//   1. Gmail sync of SYNTHETIC LinkedIn notification emails (E2E_GMAIL_FIXTURES,
//      lib/linkedin-posts/e2e-inbox.ts) → a hiring-post discovery → Reply → Track it;
//   2. pasting a post into "Add from text or link";
//   3. the Send to lee bookmarklet on a stub page (page.route: nothing reaches LinkedIn).
// Synthetic people and companies only.

async function toast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

function postCard(page: Page, text: string): Locator {
  return page.locator('[data-status]').filter({ hasText: text }).first()
}

/** The relevance gate may file a post under Filtered; bring it to the inbox. */
async function openPost(page: Page, text: string): Promise<Locator> {
  await page.goto('/discoveries?posts=1&filtered=show')
  const card = postCard(page, text)
  await expect(card).toBeVisible()
  const showAnyway = card.getByRole('button', { name: 'Show anyway' })
  if (await showAnyway.isVisible()) {
    await showAnyway.click()
    await toast(page, 'Moved to your inbox')
    await page.goto('/discoveries?posts=1')
  }
  return postCard(page, text)
}

test('syncs a LinkedIn notification email, drafts a reply and tracks the post', async ({ page }) => {
  // Block LinkedIn outright: lee must never request it.
  const linkedInHits: string[] = []
  await page.context().route(/linkedin\.com/, (route) => {
    linkedInHits.push(route.request().url())
    return route.abort()
  })

  await page.goto('/settings/linkedin#linkedin-hiring-posts')
  const panel = page.getByTestId('hiring-posts-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Turn on LinkedIn post emails' })).toContainText('Updates from your network')
  await panel.getByRole('switch', { name: /Read hiring posts/ }).check()
  await toast(page, 'lee will read your LinkedIn post emails')
  await panel.getByTestId('hiring-posts-check').click()
  // One hiring post; the non-hiring and the spoofed email are left out.
  await toast(page, /1 hiring post found · 1 new/)
  await expect(panel.getByTestId('hiring-posts-counts')).toContainText('Hiring posts1')
  await expect(panel.getByTestId('hiring-posts-health')).toHaveText('Reading fine')

  const card = await openPost(page, 'Laravel Developer')
  await expect(card).toContainText('LinkedIn post')
  await expect(card.getByTestId('post-poster')).toContainText('Posted by Layla Haddad')
  await expect(card).toContainText('Low confidence')

  await card.getByTestId('post-reply-trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Reply to the hiring post' })
  await expect(dialog.getByTestId('post-reply-body')).toHaveValue(/Laravel Developer/)
  await expect(dialog.getByTestId('post-reply-body')).toHaveValue(/Asha Menon/)
  await dialog.getByRole('button', { name: 'Email' }).click()
  await expect(dialog.getByLabel(/Subject \(to careers@dunesoft\.example\)/)).toBeVisible()
  await dialog.getByTestId('post-track').click()
  await toast(page, 'Tracked: marked applied, follow-up scheduled')

  await page.goto('/applications')
  await expect(page.getByText('Laravel Developer').filter({ visible: true }).first()).toBeVisible()
  await page.goto('/contacts')
  await expect(page.getByText('Layla Haddad').filter({ visible: true }).first()).toBeVisible()
  expect(linkedInHits).toEqual([])
})

test('adds a pasted LinkedIn post and a link-only paste', async ({ page }) => {
  await page.goto('/discoveries')
  await page.getByTestId('paste-import-trigger').click()
  const dialog = page.getByRole('dialog', { name: 'Add from text or link' })
  await dialog
    .getByTestId('paste-import-text')
    .fill(
      [
        'Noura Al-Salem',
        'Talent Partner at Kuwait Example Tech',
        "We're hiring a PHP Developer (Laravel) in Kuwait City. 3+ years. DM me or send your CV to jobs@kwtech.example #hiring",
        'https://www.linkedin.com/posts/noura_hiring-activity-7399999999999999200-AbCd?utm_source=share',
      ].join('\n'),
    )
  await dialog.getByTestId('paste-import-find').click()
  const review = dialog.getByTestId('post-review')
  await expect(review).toContainText('Reads as a hiring post')
  await expect(review.getByLabel('Role')).toHaveValue('PHP Developer (Laravel)')
  await expect(review.getByLabel('Posted by')).toHaveValue('Noura Al-Salem')
  await dialog.getByTestId('post-import-submit').click()
  await toast(page, 'Hiring post added to Discovery')

  await page.getByTestId('paste-import-trigger').click()
  await dialog.getByTestId('paste-import-text').fill('https://www.linkedin.com/feed/update/urn:li:activity:7399999999999999201/')
  await dialog.getByTestId('paste-import-find').click()
  await expect(dialog.getByTestId('post-review')).toContainText('lee keeps this as a link and never opens LinkedIn')
  await dialog.getByTestId('post-import-submit').click()
  await toast(page, 'Hiring post added to Discovery')
})

test('Send to lee: the bookmarklet posts the selection from a stub page for review', async ({ page, context }) => {
  await page.goto('/settings/linkedin#linkedin-hiring-posts')
  const link = page.getByTestId('send-to-lee-bookmarklet')
  await expect(link).toHaveAttribute('href', /^javascript:/)
  const href = (await link.getAttribute('href'))!

  // A stub "post" page: served by the test, never by LinkedIn.
  const STUB = 'https://www.linkedin.com/feed/update/urn:li:activity:7399999999999999300/'
  await context.route(/linkedin\.com/, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><p id="post">Urgent requirement: QA Engineer in Doha, Qatar. 2+ years with Selenium. Share your resume at talent@pearltech.example #hiring</p><p>Unrelated sidebar text</p></main></body></html>`,
    }),
  )
  await page.goto(STUB)
  await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('post')!)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  })
  const popupPromise = context.waitForEvent('page')
  await page.evaluate((code) => new Function(code)(), decodeURIComponent(href.slice('javascript:'.length)))
  const popup = await popupPromise
  await popup.waitForURL(/\/discoveries\/capture$/)
  // Nothing travels in the URL.
  expect(new URL(popup.url()).search).toBe('')
  const text = popup.getByTestId('paste-import-text')
  await expect(text).toHaveValue(/Urgent requirement: QA Engineer in Doha/)
  await expect(text).toHaveValue(/urn:li:activity:7399999999999999300/)
  await expect(text).not.toHaveValue(/Unrelated sidebar/)
  await popup.getByTestId('paste-import-find').click()
  await expect(popup.getByTestId('post-review')).toContainText('Reads as a hiring post')
  await popup.getByTestId('post-import-submit').click()
  await popup.waitForURL(/\/discoveries\?posts=1/)
  await expect(popup.getByText('QA Engineer').first()).toBeVisible()
})
