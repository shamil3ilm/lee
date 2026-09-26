/**
 * Lab measurement of paint timings per route, for before/after comparisons.
 *
 *   BASE_URL=http://localhost:3300 STORAGE_STATE=.e2e/auth/test-user.json \
 *     RUNS=3 pnpm tsx scripts/measure-web-vitals.ts / /applications
 *
 * Opens each route in a fresh browser context (cold page, warm server) and
 * reads the Performance API: TTFB (responseStart), FCP, LCP (last candidate),
 * CLS (session sum, no input), and "done" = when the streamed HTML response
 * finished (responseEnd), i.e. when the last Suspense boundary resolved.
 * Prints the median of RUNS for each route as a Markdown table.
 *
 * Authed routes need STORAGE_STATE: a session saved by the local-only E2E
 * test sign-in (tests/e2e/global-setup.ts). That is a dev/test identity, so
 * use these numbers for relative comparison only, never as field data.
 */
import { chromium, type Browser } from '@playwright/test'

interface Sample {
  ttfb: number
  fcp: number
  lcp: number
  cls: number
  done: number
}

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const STORAGE_STATE = process.env.STORAGE_STATE
const RUNS = Math.max(1, Number(process.env.RUNS ?? 3))
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 1500)

// Installed before any page script: buffers LCP and layout-shift entries.
const OBSERVER_SCRIPT = `
  window.__lcp = 0; window.__cls = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value })
    .observe({ type: 'layout-shift', buffered: true });
`

async function measure(browser: Browser, route: string): Promise<Sample> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
  })
  try {
    const page = await context.newPage()
    await page.addInitScript(OBSERVER_SCRIPT)
    const res = await page.goto(route, { waitUntil: 'load', timeout: 120_000 })
    if (!res || res.status() >= 400) throw new Error(`${route}: HTTP ${res?.status()}`)
    const finalPath = new URL(page.url()).pathname
    if (finalPath !== route.split('?')[0]) throw new Error(`${route}: redirected to ${finalPath}`)
    await page.waitForTimeout(SETTLE_MS)
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
      const w = window as unknown as { __lcp: number; __cls: number }
      return { ttfb: nav.responseStart, fcp, lcp: w.__lcp, cls: w.__cls, done: nav.responseEnd }
    })
  } finally {
    await context.close()
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

async function main(): Promise<void> {
  const routes = process.argv.slice(2)
  if (routes.length === 0) throw new Error('pass one or more routes, e.g. / /applications')
  const browser = await chromium.launch()
  try {
    // One throwaway load per route so compile / module init is not measured.
    for (const route of routes) await measure(browser, route)
    console.log(`| route | TTFB ms | FCP ms | LCP ms | HTML done ms | CLS |`)
    console.log(`|---|---:|---:|---:|---:|---:|`)
    for (const route of routes) {
      const samples: Sample[] = []
      for (let i = 0; i < RUNS; i++) samples.push(await measure(browser, route))
      const m = (k: keyof Sample) => median(samples.map((s) => s[k]))
      console.log(
        `| ${route} | ${m('ttfb').toFixed(0)} | ${m('fcp').toFixed(0)} | ${m('lcp').toFixed(0)} | ${m('done').toFixed(0)} | ${m('cls').toFixed(3)} |`,
      )
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
