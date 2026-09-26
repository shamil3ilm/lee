import { test, expect, type Page } from '@playwright/test'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// v17 §9.1 — visual QA pass. Opt-in: `pnpm e2e:screens`. Screenshots every
// authed page at phone and desktop sizes (light + dark) into the gitignored
// .e2e/screens folder, and records per-page defects that can be measured
// mechanically: horizontal page scroll and console errors.

const OUT = path.resolve('.e2e/screens')

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

const THEMES = (process.env.E2E_SCREENS_THEMES ?? 'light,dark').split(',') as Array<'light' | 'dark'>

type Target = { name: string; path: string } | { name: string; from: string; link: RegExp | string }

const TARGETS: Target[] = [
  { name: 'dashboard', path: '/' },
  { name: 'discoveries', path: '/discoveries' },
  { name: 'companies', path: '/companies' },
  { name: 'company-detail', from: '/companies', link: /^\/companies\/[0-9a-f-]{36}$/ },
  { name: 'applications', path: '/applications' },
  { name: 'application-detail', from: '/applications', link: /^\/applications\/[0-9a-f-]{36}$/ },
  { name: 'application-new', path: '/applications/new' },
  { name: 'documents', path: '/documents' },
  { name: 'document-editor', from: '/documents', link: /^\/documents\/[0-9a-f-]{36}\/edit$/ },
  { name: 'document-latex-new', path: '/documents/new/latex' },
  { name: 'contacts', path: '/contacts' },
  { name: 'todos', path: '/todos' },
  { name: 'digest', path: '/digest' },
  { name: 'analytics', path: '/analytics' },
  { name: 'expenses', path: '/expenses' },
  { name: 'expenses-budgets', path: '/expenses/budgets' },
  { name: 'expenses-import', path: '/expenses/import' },
  { name: 'cv-score', path: '/cv-score' },
  { name: 'playground', path: '/playground' },
  { name: 'playground-models', path: '/playground/models' },
  { name: 'playground-arena', path: '/playground/models/arena' },
  { name: 'playground-decisions', path: '/playground/decisions' },
  { name: 'settings-profile', path: '/settings/profile' },
  { name: 'settings-cv', path: '/settings/cv' },
  { name: 'settings-ai', path: '/settings/ai' },
  { name: 'settings-sources', path: '/settings/sources' },
  { name: 'settings-integrations', path: '/settings/integrations' },
  { name: 'settings-notifications', path: '/settings/notifications' },
]

interface Finding {
  page: string
  viewport: string
  theme: string
  url: string
  scrollWidth: number
  clientWidth: number
  overflowing: string[]
  consoleErrors: string[]
}

async function resolvePath(page: Page, t: Target): Promise<string> {
  if ('path' in t) return t.path
  await page.goto(t.from)
  const hrefs = await page.locator('a[href]').evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''),
  )
  const match = hrefs.find((h) => (typeof t.link === 'string' ? h === t.link : t.link.test(h)))
  if (match) return match
  // Some lists use clickable rows (role="link") instead of anchors.
  const row = page.locator('[role="link"]').first()
  if ((await row.count()) === 0) throw new Error(`no link matching ${t.link} on ${t.from}`)
  await row.click()
  await page.waitForURL((u) => (typeof t.link === 'string' ? u.pathname === t.link : t.link.test(u.pathname)))
  return new URL(page.url()).pathname
}

/** Elements whose right edge escapes the viewport (the usual h-scroll culprits). */
async function measure(page: Page): Promise<{ scrollWidth: number; clientWidth: number; overflowing: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const vw = doc.clientWidth
    const out: string[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= vw + 1) continue
      // Skip descendants of horizontally scrollable containers (intended).
      let p: Element | null = el.parentElement
      let clipped = false
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') {
          clipped = true
          break
        }
        p = p.parentElement
      }
      if (clipped) continue
      const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : ''
      out.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(r.right)}`)
      if (out.length >= 8) break
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: vw, overflowing: out }
  })
}


for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${theme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme })

      for (const t of TARGETS) {
        test(t.name, async ({ page }) => {
          const errors: string[] = []
          page.on('console', (m) => {
            if (m.type() === 'error') errors.push(m.text().slice(0, 300))
          })
          page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
          const target = await resolvePath(page, t)
          errors.length = 0
          await page.goto(target)
          await page.waitForLoadState('networkidle').catch(() => undefined)
          await expect(page).not.toHaveURL(/\/signin/)
          // Let chart enter-animations settle so screenshots show real data.
          await page.waitForTimeout(1200)
          const m = await measure(page)
          const finding: Finding = { page: t.name, viewport: vp.name, theme, url: target, ...m, consoleErrors: errors }
          await mkdir(OUT, { recursive: true })
          await appendFile(path.join(OUT, 'findings.jsonl'), `${JSON.stringify(finding)}
`)
          await page.screenshot({ path: path.join(OUT, `${vp.name}-${theme}-${t.name}.png`), fullPage: true })
        })
      }
    })
  }
}
