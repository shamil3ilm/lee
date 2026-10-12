import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './ready'

// Screening path (lib/screening): "Why this score" shows the five hiring
// stages for a seeded discovery, the discovery page shows the full path
// (axe-clean in light and dark), and cards carry the first-concern chip.
// Read-only: no seeded row changes state.

const LEDGER_ROLE = 'Senior Backend Engineer, Ledger'
const STAGES = ['eligibility', 'ats', 'recruiter', 'manager', 'odds']
const AXE_SOURCE = readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8')

async function axeOn(page: Page, selector: string): Promise<string[]> {
  await page.addScriptTag({ content: AXE_SOURCE })
  return page.evaluate(async (include) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe
    const r = await axe.run({ include: [[include]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)
  }, selector)
}

test('"Why this score" shows the screening path with every stage', async ({ page }) => {
  await page.goto('/discoveries')
  const row = page.locator('[data-slot="card"]').filter({ hasText: LEDGER_ROLE })
  await row.getByRole('button', { name: /Why this score/ }).click()
  const block = page.getByTestId('match-why').getByTestId('screening-path')
  await expect(block).toBeVisible()
  await expect(block).toContainText('Screening path')
  for (const stage of STAGES) await expect(block.locator(`[data-stage="${stage}"]`)).toHaveCount(1)
  await expect(block.getByRole('list', { name: 'Screening stages' })).toContainText('ATS keywords')
  await page.keyboard.press('Escape')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the discovery page shows the full path, axe-clean (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/discoveries')
    const row = page.locator('[data-slot="card"]').filter({ hasText: LEDGER_ROLE })
    await row.getByRole('link', { name: /Details and comparison/ }).click()
    await expect(page).toHaveURL(/\/discoveries\/[0-9a-f-]{36}$/)
    const block = page.getByTestId('screening-path').first()
    await expect(block).toBeVisible()
    for (const stage of STAGES) await expect(block.locator(`[data-stage="${stage}"]`)).toHaveCount(1)
    await expect(page.getByTestId('screening-next').first()).toBeVisible()
    expect(await axeOn(page, '[data-testid="screening-path"]')).toEqual([])
  })
}

test('a card chip names the first stage that is not a pass', async ({ page }) => {
  await page.goto('/discoveries')
  const chips = page.getByTestId('screening-chip')
  // The seeded inbox has stretches (Kubernetes, Spark, Haskell): at least one posting is not a clean pass.
  await expect(chips.first()).toBeVisible()
  await expect(chips.first()).toHaveText(/^(Knockout|At risk|Ask|ATS|Recruiter|Manager): .+/)
  await expect(chips.first()).toHaveAccessibleName(/^Screening path: .+\. Show details$/)
})

test('hovering a chip shows the stage reasons; a click opens them without leaving the list', async ({ page }) => {
  await page.goto('/discoveries')
  await waitForHydration(page)
  const chip = page.getByTestId('screening-chip').first()
  await expect(chip).toBeVisible()
  await chip.hover()
  const tip = page.getByTestId('screening-chip-details').first()
  await expect(tip).toBeVisible()
  await expect(tip).toContainText(/(Eligibility|ATS keywords|Recruiter|Hiring manager): /)
  await page.keyboard.press('Escape')
  await chip.click()
  await expect(page).toHaveURL(/\/discoveries(\?|$)/)
  await expect(page.getByRole('dialog').getByTestId('screening-chip-details')).toBeVisible()
})
