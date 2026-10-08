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
  '/settings/current-job',
  '/settings/sources',
  '/settings/integrations',
  '/settings/ai',
  '/settings/notifications',
  '/settings/logs',
  '/this-page-does-not-exist',
]

/** Routes checked for 24px targets at phone width (WCAG 2.5.8). */
const PHONE_ROUTES = ['/', '/discoveries', '/shortlist', '/settings/search', '/settings/sources', '/compare', '/applications', '/todos', '/analytics', '/radar/sources', '/settings/notifications']

interface Violation {
  id: string
  impact: string | null
  help: string
  nodes: Array<{ target: string[] }>
}

async function scan(page: Page, url: string, rules?: string[]): Promise<Violation[]> {
  await page.goto(url)
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

test.describe('targets at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  for (const url of PHONE_ROUTES) {
    test(`${url} has 24px targets`, async ({ page }) => {
      const violations = await scan(page, url, ['target-size'])
      expect(report(url, violations)).toEqual([])
    })
  }
})
