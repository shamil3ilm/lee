import { test, expect } from '@playwright/test'
import { APP_NAME } from '@/lib/brand'

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user is redirected to signin', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin/)
  await expect(page.getByText(`Sign in to ${APP_NAME}`)).toBeVisible()
  })
})

test('health endpoint returns ok', async ({ request }) => {
  const r = await request.get('/api/health')
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(body.ok).toBe(true)
})
