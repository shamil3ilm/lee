import { chromium, type FullConfig } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { E2E_AUTH_STATE, E2E_BASE_URL } from './env'

// v17 §9.1 — sign in ONCE through the local test sign-in button on /signin
// and save the resulting Auth.js session cookie as storageState. Every test
// reuses it. No Google session is read, copied or minted.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await mkdir(path.dirname(E2E_AUTH_STATE), { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ baseURL: E2E_BASE_URL })
    await page.goto('/signin', { timeout: 120_000 })
    const button = page.getByTestId('e2e-test-login')
    await button.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {
      throw new Error(
        'E2E test sign-in button not found on /signin. Is the dev server running with E2E_TEST_LOGIN=1 (and not NODE_ENV=production / VERCEL)?',
      )
    })
    await button.click()
    await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 120_000 })
    await page.context().storageState({ path: E2E_AUTH_STATE })
  } finally {
    await browser.close()
  }
}
