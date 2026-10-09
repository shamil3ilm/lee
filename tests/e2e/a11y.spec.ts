import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

// Accessibility gate (audit §1, S7–S9, S15): axe-core on the main routes in
// light and dark at desktop width, plus target sizes at phone width. Fails on
// serious or critical violations of WCAG 2.2 A/AA. Moderate and minor
// findings are printed but don't fail the run.

// axe-core is a direct devDependency, so pnpm links it at the top level.
const AXE_SOURCE = readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])

const ROUTES = [
  '/',
  '/shortlist',
  '/discoveries',
  '/discoveries?view=board',
  '/discoveries?status=filtered',
  // Region filter: a hierarchical selection with chips, and "Group by region".
  '/discoveries?status=dismissed&region=kerala,dubai&by=region',
  '/shortlist?region=kerala',
  '/compare',
  '/applications',
  '/applications?view=board',
  '/companies',
  '/contacts',
  '/documents',
  '/cv-score',
  '/todos',
  '/expenses',
  '/digest',
  '/analytics',
  '/playground',
  '/playground/problems',
  '/playground/history',
  '/radar',
  '/radar/watchlist',
  '/radar/sources',
  '/?setup=1',
  '/settings/profile',
  '/settings/search',
  '/settings/resume',
  '/settings/variants',
  '/settings/study',
  '/settings/current-job',
  '/settings/sources',
  '/settings/integrations',
  '/settings/linkedin',
  '/settings/publish',
  '/settings/ai',
  '/settings/notifications',
  '/settings/logs',
  '/this-page-does-not-exist',
]

/** Routes checked for 24px targets at phone width (WCAG 2.5.8). */
const PHONE_ROUTES = ['/', '/discoveries', '/shortlist', '/settings/search', '/settings/sources', '/compare', '/applications', '/todos', '/analytics', '/radar/sources', '/settings/notifications', '/settings/variants', '/settings/integrations', '/settings/linkedin']

interface Violation {
  id: string
  impact: string | null
  help: string
  nodes: Array<{ target: string[] }>
}

async function scan(page: Page, url: string, rules?: string[]): Promise<Violation[]> {
  await page.goto(url)
  return scanHere(page, rules)
}

/** Scan the page as it is now (after opening a section, for example). */
async function scanHere(page: Page, rules?: string[]): Promise<Violation[]> {
  await page.waitForLoadState('networkidle').catch(() => undefined)
  // Charts and lazy boards settle after hydration.
  await page.waitForTimeout(500)
  await page.addScriptTag({ content: AXE_SOURCE })
  return page.evaluate(
    async ({ tags, only }) => {
      const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: Violation[] }> } }).axe
      const result = await axe.run(
        // The Next.js dev overlay is not part of the app.
        { exclude: [['nextjs-portal']] },
        only ? { runOnly: { type: 'rule', values: only }, resultTypes: ['violations'] } : { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] },
      )
      return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target })) }))
    },
    { tags: TAGS, only: rules ?? null },
  )
}

function report(url: string, violations: Violation[]): string[] {
  return violations.map(
    (v) => `${url} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`,
  )
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    for (const url of ROUTES) {
      test(`${url} has no serious or critical violations (${theme})`, async ({ page }) => {
        const violations = await scan(page, url)
        const minor = violations.filter((v) => !BLOCKING.has(v.impact ?? ''))
        if (minor.length > 0) console.log(report(url, minor).join('\n'))
        expect(report(url, violations.filter((v) => BLOCKING.has(v.impact ?? '')))).toEqual([])
      })
    }
  })
}

/**
 * Best CV, photo advice and Tailor to this JD (lib/cv-fit) live on dynamic
 * routes: the seeded application that is mid-preparation (the Swiggy
 * posting, which no journey changes), its Prepare page and its detail page
 * with the Tailor section open.
 */
async function preparingApplication(page: Page): Promise<string> {
  await page.goto('/applications?view=list')
  // Table rows are clickable rows (role="link", no href): open one and read the URL.
  await page.getByRole('link', { name: /Senior Data Engineer/ }).first().click()
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/)
  return new URL(page.url()).pathname
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe ${theme}: best CV and tailoring`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test(`prepare and application detail have no serious or critical violations (${theme})`, async ({ page }) => {
      const app = await preparingApplication(page)
      const prepare = await scan(page, `${app}/prepare`)
      expect(report(`${app}/prepare`, prepare.filter((v) => BLOCKING.has(v.impact ?? '')))).toEqual([])
      await page.goto(app)
      await page.getByRole('button', { name: /Tailor to this JD/ }).click()
      await expect(page.getByTestId('tailor-panel')).toBeVisible()
      const detail = await scanHere(page)
      expect(report(app, detail.filter((v) => BLOCKING.has(v.impact ?? '')))).toEqual([])
    })
  })
}

/** The region picker open: search, quick picks, the tree with a mixed parent, chips. */
async function openRegionPicker(page: Page, url: string, testId: string): Promise<void> {
  await page.goto(url)
  await page.getByTestId(testId).click()
  await expect(page.getByTestId('region-tree').first()).toBeVisible()
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe ${theme}: region picker`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test(`the open Region filter and Settings picker have no serious or critical violations (${theme})`, async ({ page }) => {
      await openRegionPicker(page, '/discoveries?region=kochi', 'region-filter')
      const filter = await scanHere(page)
      expect(report('region filter', filter.filter((v) => BLOCKING.has(v.impact ?? '')))).toEqual([])
      await openRegionPicker(page, '/settings/search', 'target-regions-picker')
      const settings = await scanHere(page)
      expect(report('settings region picker', settings.filter((v) => BLOCKING.has(v.impact ?? '')))).toEqual([])
    })
  })
}

test.describe('targets at phone width', () => {
  test('the region picker sheet has 24px targets', async ({ page }) => {
    await openRegionPicker(page, '/discoveries?region=kochi', 'region-filter')
    const violations = await scanHere(page, ['target-size'])
    expect(report('region picker sheet', violations)).toEqual([])
  })

  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  for (const url of PHONE_ROUTES) {
    test(`${url} has 24px targets`, async ({ page }) => {
      const violations = await scan(page, url, ['target-size'])
      expect(report(url, violations)).toEqual([])
    })
  }
  test('prepare (best CV, photo advice, tailoring) has 24px targets', async ({ page }) => {
    const app = await preparingApplication(page)
    const violations = await scan(page, `${app}/prepare`, ['target-size'])
    expect(report(`${app}/prepare`, violations)).toEqual([])
  })
})
