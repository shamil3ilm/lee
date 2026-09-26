import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the design tokens in app/globals.css: every text/background pairing
// the components use must pass WCAG AA (4.5:1 body text), and graphics
// (focus ring, chart series) must pass the 3:1 non-text minimum, in both
// themes. See docs/design-system.md for the table this enforces.

const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`missing ${selector} block`)
  const end = css.indexOf('}', start)
  const out: Record<string, string> = {}
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim()
  }
  return out
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100
  const light = l / 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number): number => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

function luminance(triple: string): number {
  const [h, s, l] = triple.split(/\s+/).map((x) => Number.parseFloat(x)) as [number, number, number]
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = hslToRgb(h, s, l)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const light = block(':root')
const dark = { ...light, ...block('.dark') }

const TEXT_PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'muted'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['destructive-foreground', 'destructive'],
]

const TONES = [
  'success',
  'warning',
  'danger',
  'info',
  'neutral',
  'stage-saved',
  'stage-applied',
  'stage-screen',
  'stage-interview',
  'stage-offer',
  'stage-rejected',
  'stage-withdrawn',
]
for (const t of TONES) {
  TEXT_PAIRS.push([t, 'background'], [t, 'card'], [t, `${t}-soft`], [`${t}-foreground`, t])
}

const GRAPHIC_PAIRS: Array<[string, string]> = [
  ['ring', 'background'],
  ['ring', 'card'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i): [string, string] => [`chart-${i}`, 'card']),
  ...[1, 2, 3, 4, 5].map((i): [string, string] => [`chart-seq-${i}`, 'card']),
]

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme tokens', (_name, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s passes AA (4.5:1)', (fg, bg) => {
    expect(tokens[fg], `token --${fg}`).toBeDefined()
    expect(tokens[bg], `token --${bg}`).toBeDefined()
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GRAPHIC_PAIRS)('%s on %s passes non-text 3:1', (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3)
  })
})

describe('brand anchors', () => {
  it('primary is the logo navy in light mode', () => {
    expect(light.primary).toBe(light['brand-navy'])
  })
  it('primary is the logo slate-blue in dark mode', () => {
    expect(dark.primary).toBe(light['brand-slate'])
  })
})
