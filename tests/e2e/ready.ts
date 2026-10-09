import type { Page } from '@playwright/test'

/**
 * Wait until React has hydrated the current page (components/hydration-marker.tsx).
 * Interact with client handlers (file inputs, keyboard shortcuts) only after this.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 30_000 })
}
