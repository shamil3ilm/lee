import { describe, expect, it } from 'vitest'
import { compileLatex } from '@/lib/latex/compile'
import { isServiceUnavailable } from '@/lib/latex/compile-types'
import { buildRecipe } from '@/lib/variants/presets'
import { renderVariant } from '@/lib/variants/render'
import { variantToLatex } from '@/lib/variants/latex'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

/**
 * Live compiles against the real services. Skipped when latexonline.cc
 * can't be reached (offline, sandboxed CI); a service outage during the run
 * skips rather than fails, since it says nothing about lee's code.
 */

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4_000) })
    return res.status < 500
  } catch {
    return false
  }
}

const online = process.env.LEE_SKIP_LIVE === '1' ? false : await reachable('https://latexonline.cc/')

describe.skipIf(!online)('live compile', () => {
  it('compiles the Classic variant on the primary service, no fallback needed', { timeout: 90_000 }, async (ctx) => {
    const p = syntheticProfile()
    const recipe = { ...buildRecipe(p, { region: 'remote', roleFamily: null }), template: 'classic' as const }
    const r = await compileLatex(variantToLatex(renderVariant(p, recipe, { hasPhoto: false }), 1))
    if (!r.ok && isServiceUnavailable(r.status)) ctx.skip()
    expect(r.ok ? 'ok' : r.log).toBe('ok')
    expect(r.service).toBe('latexonline')
    if (r.ok) expect(Buffer.from(r.pdf).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('compiles a fontawesome5 document via the automatic fallback', { timeout: 90_000 }, async (ctx) => {
    const r = await compileLatex('\\documentclass{article}\n\\usepackage{fontawesome5}\n\\begin{document}\\faGithub{} x\\end{document}\n')
    if (!r.ok && isServiceUnavailable(r.status)) ctx.skip()
    expect(r.ok ? 'ok' : r.log).toBe('ok')
    expect(r.notes?.join(' ')).toMatch(/fontawesome5/)
  })
})
