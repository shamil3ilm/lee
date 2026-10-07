import type { QualityMetrics } from './quality-types'

/**
 * Code-quality metrics (v13 §4.3) and their score. JavaScript (and
 * TypeScript after its types are stripped) is parsed with acorn by
 * ./quality-js.ts inside the runner worker; Python and PHP use the
 * line-based estimate below, computed on the server from the submitted code.
 * Pure.
 */

export const QUALITY_LIMITS = { fnLength: 40, nesting: 3, cyclomatic: 10 } as const

/** 100 for short, shallow, well-named code; deductions per excess. */
export function qualityScore(m: QualityMetrics): number {
  const length = Math.min(30, Math.max(0, m.maxFnLength - QUALITY_LIMITS.fnLength))
  const nesting = 10 * Math.max(0, m.nesting - QUALITY_LIMITS.nesting)
  const branches = Math.min(20, 2 * Math.max(0, m.cyclomatic - QUALITY_LIMITS.cyclomatic))
  const naming = Math.min(20, 5 * m.namingIssues)
  return Math.max(0, 100 - length - nesting - branches - naming)
}

export function qualityAdvice(m: QualityMetrics): string[] {
  const out: string[] = []
  if (m.maxFnLength > QUALITY_LIMITS.fnLength) out.push(`Your longest function is ${m.maxFnLength} lines; extract helpers to keep each under ${QUALITY_LIMITS.fnLength}.`)
  if (m.nesting > QUALITY_LIMITS.nesting) out.push(`Nesting reaches ${m.nesting} levels; return early or extract the inner loop to stay at ${QUALITY_LIMITS.nesting} or less.`)
  if (m.cyclomatic > QUALITY_LIMITS.cyclomatic) out.push(`Cyclomatic complexity is ${m.cyclomatic}; fewer branches make the code easier to test.`)
  if (m.namingIssues > 0) out.push(`${m.namingIssues} single-letter name${m.namingIssues === 1 ? '' : 's'} outside loop counters; descriptive names read better in review.`)
  return out
}

/** Single letters that are conventional: loop counters, sizes, coordinates, comparator args. */
export const SHORT_NAMES_OK: ReadonlySet<string> = new Set(['i', 'j', 'k', 'n', 'm', 'x', 'y', 'a', 'b', '_'])

function blockFunctions(lines: readonly string[], isStart: (line: string) => boolean): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  lines.forEach((line, i) => {
    if (!isStart(line)) return
    let depth = 0
    let opened = false
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j] ?? '') {
        if (ch === '{') {
          depth++
          opened = true
        } else if (ch === '}') depth--
      }
      if (opened && depth <= 0) {
        out.push({ start: i, end: j })
        return
      }
    }
    out.push({ start: i, end: lines.length - 1 })
  })
  return out
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function pythonFunctions(lines: readonly string[]): Array<{ start: number; end: number; indent: number }> {
  const out: Array<{ start: number; end: number; indent: number }> = []
  lines.forEach((line, i) => {
    if (!/^\s*def\s+\w+/.test(line)) return
    const indent = indentOf(line)
    let end = i
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] ?? ''
      if (l.trim() === '' || l.trim().startsWith('#')) continue
      if (indentOf(l) <= indent) break
      end = j
    }
    out.push({ start: i, end, indent })
  })
  return out
}

function pythonMetrics(lines: readonly string[]): QualityMetrics {
  const fns = pythonFunctions(lines)
  const maxFnLength = fns.reduce((m, f) => Math.max(m, f.end - f.start + 1), 0)
  const control = /^\s*(if|elif|else|for|while|try|except|with|match|case)\b/
  let nesting = 0
  for (const f of fns) {
    const unit = (() => {
      const body = lines.slice(f.start + 1, f.end + 1).find((l) => l.trim() !== '')
      return Math.max(1, (body ? indentOf(body) : f.indent + 4) - f.indent)
    })()
    for (const l of lines.slice(f.start + 1, f.end + 1)) {
      if (control.test(l)) nesting = Math.max(nesting, Math.round((indentOf(l) - f.indent) / unit))
    }
  }
  const code = lines.join('\n').replace(/#.*$/gm, '')
  const decisions = (code.match(/\b(if|elif|for|while|and|or|except|case)\b/g) ?? []).length
  const assigned = [...code.matchAll(/(?:^|[\s,(])([A-Za-z_]\w*)\s*(?:=(?!=)|\bin\b)/gm)].map((m) => m[1] ?? '')
  const params = [...code.matchAll(/def\s+\w+\s*\(([^)]*)\)/g)].flatMap((m) => (m[1] ?? '').split(',').map((p) => p.split(/[:=]/)[0]?.trim() ?? ''))
  const namingIssues = new Set([...assigned, ...params].filter((n) => n.length === 1 && !SHORT_NAMES_OK.has(n))).size
  return { maxFnLength, nesting, cyclomatic: decisions + 1, namingIssues, method: 'lines' }
}

function phpMetrics(lines: readonly string[]): QualityMetrics {
  const fns = blockFunctions(lines, (l) => /\bfunction\s+\w+\s*\(/.test(l))
  const maxFnLength = fns.reduce((m, f) => Math.max(m, f.end - f.start + 1), 0)
  let nesting = 0
  for (const f of fns) {
    let depth = 0
    for (const l of lines.slice(f.start, f.end + 1)) {
      for (const ch of l) {
        if (ch === '{') depth++
        else if (ch === '}') depth--
        nesting = Math.max(nesting, depth - 1)
      }
    }
  }
  const code = lines.join('\n').replace(/\/\/.*$|#.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const decisions = (code.match(/\b(if|elseif|for|foreach|while|case|catch)\b|&&|\|\||\?\?/g) ?? []).length
  const vars = [...code.matchAll(/\$([A-Za-z_]\w*)/g)].map((m) => m[1] ?? '')
  const namingIssues = new Set(vars.filter((n) => n.length === 1 && !SHORT_NAMES_OK.has(n))).size
  return { maxFnLength, nesting: Math.max(0, nesting), cyclomatic: decisions + 1, namingIssues, method: 'lines' }
}

/** Line-based metrics for languages without an in-app parser. */
export function lineMetrics(code: string, language: 'python' | 'php'): QualityMetrics {
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  return language === 'python' ? pythonMetrics(lines) : phpMetrics(lines)
}

/** Clamp metrics a browser reported (they are scored on the server). */
export function sanitizeMetrics(value: unknown): QualityMetrics | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const num = (k: string) => (typeof v[k] === 'number' && Number.isFinite(v[k]) ? Math.min(10_000, Math.max(0, Math.round(v[k] as number))) : null)
  const maxFnLength = num('maxFnLength')
  const nesting = num('nesting')
  const cyclomatic = num('cyclomatic')
  const namingIssues = num('namingIssues')
  if (maxFnLength === null || nesting === null || cyclomatic === null || namingIssues === null) return null
  return { maxFnLength, nesting, cyclomatic, namingIssues, method: 'ast' }
}
