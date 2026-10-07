import { describe, expect, it, vi } from 'vitest'
import { compileWithFallback, COMPILE_BUDGET_MS, type FallbackDeps } from '@/lib/latex/fallback'
import type { BackendCompile, BackendRequest, CompileResult } from '@/lib/latex/compile-types'

const PDF = new Uint8Array([37, 80, 68, 70]).buffer as ArrayBuffer
const ok = (): CompileResult => ({ ok: true, pdf: PDF })
const fail = (status: number, log: string): CompileResult => ({ ok: false, status, log })
const FA5_MISSING = "main.tex:2: error: File `fontawesome5.sty' not found"
const SOURCE = '\\documentclass{article}\n\\usepackage{fontawesome5}\n\\begin{document}\\faGithub\\end{document}'

function deps(latexonline: BackendCompile, ytotech: BackendCompile, now = () => 0): FallbackDeps {
  return { backends: { latexonline, ytotech }, now }
}

const seq = (...results: CompileResult[]) => {
  let i = 0
  return vi.fn(async (_req: BackendRequest) => results[Math.min(i++, results.length - 1)]!)
}

describe('compileWithFallback (auto)', () => {
  it('uses only the primary when it succeeds', async () => {
    const lo = seq(ok())
    const yt = seq(ok())
    const r = await compileWithFallback({ source: SOURCE }, deps(lo, yt))
    expect(r).toMatchObject({ ok: true, notes: [] })
    expect(yt).not.toHaveBeenCalled()
  })

  it('retries on YtoTech when the primary lacks a package, and says so', async () => {
    const lo = seq(fail(400, FA5_MISSING))
    const yt = seq({ ...ok(), service: 'ytotech' })
    const r = await compileWithFallback({ source: SOURCE }, deps(lo, yt))
    expect(r.ok).toBe(true)
    expect(r.service).toBe('ytotech')
    expect(r.notes).toEqual([
      "latexonline.cc doesn't have package fontawesome5; compiled on YtoTech (full TeX Live) instead.",
    ])
    expect(yt.mock.calls[0]![0]).toMatchObject({ source: SOURCE, engine: 'pdflatex' })
  })

  it('retries on YtoTech when the primary is down', async () => {
    const r = await compileWithFallback({ source: 'x' }, deps(seq(fail(502, 'unreachable')), seq(ok())))
    expect(r.ok).toBe(true)
    expect(r.notes?.[0]).toContain('latexonline.cc is unavailable (status 502)')
  })

  it('does not retry a real document error', async () => {
    const yt = seq(ok())
    const r = await compileWithFallback({ source: 'x' }, deps(seq(fail(400, 'main.tex:5: error: Undefined control sequence')), yt))
    expect(r).toMatchObject({ ok: false, status: 400 })
    expect(yt).not.toHaveBeenCalled()
  })

  it("returns the fallback's log when the document still fails there", async () => {
    const r = await compileWithFallback(
      { source: SOURCE },
      deps(seq(fail(400, FA5_MISSING)), seq(fail(400, './main.tex:3: Undefined control sequence.'))),
    )
    expect(r).toMatchObject({ ok: false, log: './main.tex:3: Undefined control sequence.' })
    expect(r.notes?.[0]).toContain('which reported the errors below')
  })

  it('falls back to the bundled stand-in when YtoTech is down too', async () => {
    const lo = seq(fail(400, FA5_MISSING), ok())
    const r = await compileWithFallback({ source: SOURCE }, deps(lo, seq(fail(503, 'down'))))
    expect(r.ok).toBe(true)
    expect(lo).toHaveBeenCalledTimes(2)
    const shimmed = lo.mock.calls[1]![0]
    expect(shimmed.assets.map((a) => a.filename)).toEqual(['fontawesome5.sty'])
    expect(shimmed.assets[0]!.bytes.toString('utf8')).toContain('\\ProvidesPackage{fontawesome5}')
    expect(r.notes).toEqual([
      "latexonline.cc doesn't have package fontawesome5, and the full TeX Live fallback (YtoTech (full TeX Live)) is unavailable right now.",
      "fontawesome5 isn't available on the compile service; icons shown as text.",
    ])
  })

  it('never replaces a .sty the user uploaded', async () => {
    const lo = seq(fail(400, FA5_MISSING), ok())
    const own = { filename: 'fontawesome5.sty', mimeType: 'text/x-tex', bytes: Buffer.from('% mine') }
    const r = await compileWithFallback({ source: SOURCE, assets: [own] }, deps(lo, seq(fail(503, 'down'))))
    expect(r.ok).toBe(false)
    expect(lo).toHaveBeenCalledTimes(1)
  })

  it('shares one time budget across attempts', async () => {
    let t = 0
    const lo = vi.fn(async (_req: BackendRequest) => {
      t += COMPILE_BUDGET_MS - 10_000
      return fail(504, 'timed out')
    })
    const yt = seq(ok())
    await compileWithFallback({ source: 'x' }, deps(lo, yt, () => t))
    expect(lo.mock.calls[0]![0].timeoutMs).toBe(25_000)
    expect(yt.mock.calls[0]![0].timeoutMs).toBe(10_000)
  })
})

describe('compileWithFallback (manual service)', () => {
  it('latexonline only: no YtoTech, but the stand-in still applies', async () => {
    const lo = seq(fail(400, FA5_MISSING), ok())
    const yt = seq(ok())
    const r = await compileWithFallback(
      { source: SOURCE, settings: { service: 'latexonline', engine: 'pdflatex', stopOnError: true } },
      deps(lo, yt),
    )
    expect(r.ok).toBe(true)
    expect(yt).not.toHaveBeenCalled()
    expect(r.notes).toEqual(["fontawesome5 isn't available on the compile service; icons shown as text."])
  })

  it('ytotech only, with the chosen engine', async () => {
    const lo = seq(ok())
    const yt = seq(ok())
    await compileWithFallback({ source: 'x', settings: { service: 'ytotech', engine: 'xelatex', stopOnError: true } }, deps(lo, yt))
    expect(lo).not.toHaveBeenCalled()
    expect(yt.mock.calls[0]![0].engine).toBe('xelatex')
  })
})

describe('compileWithFallback (stop on first error off)', () => {
  const ERR = 'main.tex:5: error: Undefined control sequence'

  it('compiles anyway on YtoTech with force and returns the error log', async () => {
    const lo = seq(fail(400, ERR))
    const yt = seq({ ...ok(), service: 'ytotech' })
    const r = await compileWithFallback(
      { source: 'x', settings: { service: 'auto', engine: 'pdflatex', stopOnError: false } },
      deps(lo, yt),
    )
    expect(r).toMatchObject({ ok: true, log: ERR, service: 'ytotech' })
    expect(yt.mock.calls[0]![0].force).toBe(true)
    expect(r.notes?.at(-1)).toContain('Compiled anyway despite errors')
  })

  it('stays a failure when even the forced compile yields nothing', async () => {
    const r = await compileWithFallback(
      { source: 'x', settings: { service: 'ytotech', engine: 'pdflatex', stopOnError: false } },
      deps(seq(ok()), seq(fail(400, ERR), fail(400, ERR))),
    )
    expect(r).toMatchObject({ ok: false, log: ERR })
  })

  it('is not offered on latexonline.cc only', async () => {
    const yt = seq(ok())
    const r = await compileWithFallback(
      { source: 'x', settings: { service: 'latexonline', engine: 'pdflatex', stopOnError: false } },
      deps(seq(fail(400, ERR)), yt),
    )
    expect(r.ok).toBe(false)
    expect(yt).not.toHaveBeenCalled()
  })
})
