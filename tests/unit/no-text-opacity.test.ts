import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Audit S8: `opacity-*` on text drops tone and muted text below 4.5:1, and
 * the token contrast test can't see it. De-emphasise with a token instead
 * (`text-muted-foreground`, `font-normal`). A bare `opacity-N` (no variant
 * such as `disabled:` or `hover:`) is only allowed on icons and on controls
 * shown in a disabled or busy state, listed here with the reason.
 */
const ALLOWED: Record<string, string> = {
  'components/applications-table.tsx': 'unsorted column icon',
  'components/compare/current-job-sections.tsx': 'disabled chip',
  'components/discovery/match-badge.tsx': 'info icon inside the badge',
  'components/discovery/pager.tsx': 'disabled (aria-hidden) pager ends',
  'components/lab/model-picker.tsx': 'disabled option',
  'components/latex/workspace/compile-menu.tsx': 'disabled menu item',
  'components/latex/workspace/file-tabs.tsx': 'close icon (LaTeX editor, owned separately)',
  'components/latex-template-picker.tsx': 'busy state',
  'components/ui/native-select.tsx': 'chevron icon',
  'components/ui/select.tsx': 'chevron icon',
}

const ROOT = path.resolve(__dirname, '../..')
const BARE_OPACITY = /(?:^|["'`\s{(])opacity-([1-9]\d?)\b/

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full))
    else if (name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('no opacity on text', () => {
  it('uses a bare opacity-N class only in the allow-listed icon and disabled-state files', () => {
    const offenders: string[] = []
    for (const dir of ['app', 'components']) {
      for (const file of tsxFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).split(path.sep).join('/')
        if (rel in ALLOWED) continue
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (BARE_OPACITY.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
          })
      }
    }
    expect(offenders).toEqual([])
  })
})
