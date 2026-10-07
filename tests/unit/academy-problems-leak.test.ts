import { describe, expect, it } from 'vitest'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import { judgePack, solutionView, toPublicProblem } from '@/lib/academy/problems/public'
import type { Problem } from '@/lib/academy/problems/schema'

/**
 * Hidden-test non-leakage (phase 13.1): what the browser gets before solving
 * (the public problem) carries no hidden input, no hidden expected value and
 * no reference solution; the Submit pack carries hidden inputs (they must run
 * in the browser) but never an expected output or the reference.
 * The client bundle is checked by scripts/check-playground-bundle.mjs.
 */

const catalog = loadProblemCatalog()

/** Distinctive JSON fragments of a value (short ones like `true` or `0` would match anything). */
function fragments(values: readonly unknown[], visible: string): string[] {
  return values
    .map((v) => JSON.stringify(v))
    .filter((s): s is string => typeof s === 'string' && s.length >= 10 && !visible.includes(s))
}

function hiddenInputs(p: Problem): unknown[] {
  return p.kind === 'sql' ? p.hidden.map((t) => t.seed) : p.hidden.map((t) => t.args)
}

function visibleText(p: Problem): string {
  return JSON.stringify([p.statement, p.samples, p.constraints, p.hints])
}

describe.each(catalog.problems.map((p) => [p.slug, p] as const))('%s', (_slug, p) => {
  const visible = visibleText(p)

  it('the public problem has no hidden inputs, hidden expectations or reference', () => {
    const pub = JSON.stringify(toPublicProblem(p))
    expect(pub).not.toContain(p.reference.code)
    expect(pub).not.toContain(p.reference.approach)
    for (const f of fragments(hiddenInputs(p), visible)) expect(pub).not.toContain(f)
    for (const f of fragments(p.hidden.map((t) => t.expected), visible)) expect(pub).not.toContain(f)
    expect(pub).not.toContain('"hidden"')
    expect(pub).not.toContain('"hints"')
  })

  it('the Submit pack has hidden inputs but no expected outputs or reference', () => {
    const pack = judgePack(p, 7)
    const json = JSON.stringify(pack)
    expect(json).not.toContain(p.reference.code)
    expect(json).not.toContain('"expected"')
    for (const f of fragments(p.hidden.map((t) => t.expected), JSON.stringify(hiddenInputs(p)) + visible)) expect(json).not.toContain(f)
    const count = pack.kind === 'sql' ? pack.hiddenSeeds.length : pack.hiddenArgs.length
    expect(count).toBe(p.hidden.length)
  })

  it('the solution view is the reference (served only once unlocked)', () => {
    expect(solutionView(p).code).toBe(p.reference.code)
  })
})
