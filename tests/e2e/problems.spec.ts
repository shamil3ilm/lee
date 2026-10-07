import { test, expect, type Page } from '@playwright/test'

// v13 phase 13.1 — the coding workbench end to end, in JavaScript (fast, no
// CDN): open a problem, Run a wrong solution (Wrong Answer on a visible
// sample), fix it, Run (samples pass), Submit (hidden tests run in the
// browser worker, judged on the server), Accepted, and the submission is
// listed. The Python, PHP and SQL runtimes load from the jsDelivr CDN, so
// their checks are opt-in: E2E_RUNTIMES=1 pnpm test:e2e tests/e2e/problems.spec.ts

const SLUG = 'refund-pair'

const WRONG = `function refundPair(amounts, target) {
  return [0, 1]
}`

const RIGHT = `function refundPair(amounts, target) {
  const seen = new Map()
  for (let i = 0; i < amounts.length; i++) {
    const need = target - amounts[i]
    if (seen.has(need)) return [seen.get(need), i]
    seen.set(amounts[i], i)
  }
  return []
}`

async function setCode(page: Page, code: string): Promise<void> {
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Delete')
  // insertText bypasses auto-closing brackets and indentation.
  await page.keyboard.insertText(code)
}

async function chooseLanguage(page: Page, label: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Language' }).selectOption({ label })
}

test.beforeEach(async ({ page }) => {
  // Fresh drafts every run (drafts live in localStorage).
  await page.addInitScript(() => {
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith('lee:problems:')) window.localStorage.removeItem(key)
    } catch {
      /* storage blocked */
    }
  })
})

test('problem set lists, filters and opens a problem', async ({ page }) => {
  await page.goto('/playground/problems')
  await expect(page.getByRole('heading', { name: 'Problems', level: 1 })).toBeVisible()
  await expect(page.getByTestId('problem-row').first()).toBeVisible()
  const filters = page.getByRole('group', { name: 'Filter problems' })
  await filters.getByRole('combobox', { name: 'Difficulty' }).selectOption('hard')
  await filters.getByRole('button', { name: 'Apply' }).click()
  await page.waitForURL(/difficulty=hard/)
  await expect(page.getByTestId('problem-row').first()).toContainText(/./)
  await expect(page.getByRole('table', { name: 'Problems' })).not.toContainText('Easy')
  await page.goto('/playground/problems?q=refund')
  await page.getByRole('link', { name: 'Refund pair' }).click()
  await page.waitForURL(`**/playground/problems/${SLUG}`)
  await expect(page.getByRole('heading', { name: 'Refund pair', level: 1 })).toBeVisible()
})

test('run fails, fix, run passes, submit is accepted and listed', async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto(`/playground/problems/${SLUG}`)
  await expect(page.getByTestId('code-editor')).toBeVisible()
  await chooseLanguage(page, 'JavaScript')

  await setCode(page, WRONG)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Wrong Answer', { timeout: 60_000 })
  await expect(page.getByTestId('failed-visible')).toContainText('Sample')
  await expect(page.getByTestId('actual-output')).toHaveText('[0,1]')

  await setCode(page, RIGHT)
  // Ctrl+Enter runs from the editor.
  await page.locator('.cm-content').first().press('ControlOrMeta+Enter')
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 })
  await expect(page.getByTestId('run-result')).toContainText('samples only')

  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  const result = page.getByTestId('submit-result')
  await expect(result).toBeVisible({ timeout: 90_000 })
  await expect(result.getByTestId('verdict')).toHaveText('Accepted')
  await expect(result.getByTestId('passed')).toHaveText(/^(\d+)\/\1 passed$/)
  await expect(result.getByTestId('evaluation')).toContainText('composite')

  await page.getByRole('tab', { name: /Submissions/ }).click()
  const submission = page.getByTestId('submission').first()
  await expect(submission).toContainText('Accepted')
  await expect(submission).toContainText('JavaScript')
  // Solved: the reference solution is now unlocked.
  await page.getByRole('tab', { name: 'Solution' }).click()
  await expect(page.getByTestId('solution-code')).toContainText('function refundPair')

  // The problem set shows it solved, and history records the attempt.
  await page.goto('/playground/problems?q=refund')
  await expect(page.getByTestId('problem-row').first().getByRole('img', { name: 'Solved' })).toBeVisible()
})

test('runners are lazy: no worker or CDN runtime until Run, then only the JS worker', async ({ page }) => {
  const cdn: string[] = []
  const workers: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('cdn.jsdelivr.net')) cdn.push(r.url())
  })
  page.on('worker', (w) => workers.push(w.url()))
  await page.goto('/playground/problems')
  await expect(page.getByTestId('problem-row').first()).toBeVisible()
  await page.goto(`/playground/problems/${SLUG}`)
  await expect(page.getByTestId('code-editor')).toBeVisible()
  expect(workers).toEqual([])
  expect(cdn).toEqual([])
  await chooseLanguage(page, 'JavaScript')
  await setCode(page, RIGHT)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 })
  expect(workers).toHaveLength(1)
  // JavaScript needs no CDN runtime.
  expect(cdn).toEqual([])
})

test('a compile error is reported before any test runs', async ({ page }) => {
  await page.goto(`/playground/problems/${SLUG}`)
  await chooseLanguage(page, 'TypeScript')
  await setCode(page, 'function refundPair(amounts: number[], target: number): number[] {\n  return [0, 1\n}')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Compile Error', { timeout: 60_000 })
  await expect(page.getByTestId('compile-error')).toContainText(/TypeScript|SyntaxError/)
})

test('an infinite loop hits the time limit and the worker is replaced', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto(`/playground/problems/${SLUG}`)
  await chooseLanguage(page, 'JavaScript')
  await setCode(page, 'function refundPair(amounts, target) {\n  while (true) {}\n}')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Time Limit Exceeded', { timeout: 60_000 })
  // A fresh worker runs the next job normally.
  await setCode(page, RIGHT)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 })
})

test.describe('CDN runtimes (opt-in: E2E_RUNTIMES=1)', () => {
  test.skip(process.env.E2E_RUNTIMES !== '1', 'Pyodide, PHP and PGlite load from the jsDelivr CDN')
  test.setTimeout(240_000)

  test('Python via Pyodide', async ({ page }) => {
    await page.goto(`/playground/problems/${SLUG}`)
    await chooseLanguage(page, 'Python')
    await setCode(page, 'def refund_pair(amounts, target):\n    seen = {}\n    for i, a in enumerate(amounts):\n        if target - a in seen:\n            return [seen[target - a], i]\n        seen[a] = i\n    return []\n')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 180_000 })
  })

  test('PHP via php-wasm', async ({ page }) => {
    await page.goto(`/playground/problems/${SLUG}`)
    await chooseLanguage(page, 'PHP')
    await setCode(
      page,
      '<?php\nfunction refundPair(array $amounts, int $target): array\n{\n    $seen = [];\n    foreach ($amounts as $i => $a) {\n        if (isset($seen[$target - $a])) {\n            return [$seen[$target - $a], $i];\n        }\n        $seen[$a] = $i;\n    }\n    return [];\n}\n',
    )
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 180_000 })
  })

  test('SQL via PGlite', async ({ page }) => {
    await page.goto('/playground/problems/merchant-volume')
    await setCode(
      page,
      "SELECT m.name, SUM(p.amount_cents) AS settled_cents\nFROM merchants m JOIN payments p ON p.merchant_id = m.id\nWHERE p.status = 'succeeded'\nGROUP BY m.id, m.name\nORDER BY settled_cents DESC, m.name",
    )
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 180_000 })
  })
})
