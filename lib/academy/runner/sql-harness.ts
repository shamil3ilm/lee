import type { SqlResult } from '@/lib/academy/problems/schema'
import { normalizeSqlCells } from './compare'
import { errorMessage } from './js-harness'
import type { CaseOutcome } from './protocol'

/**
 * The SQL harness: for each dataset, create the schema, load the seed rows,
 * run the user's single SELECT and read the result set, inside a transaction
 * that is always rolled back (each case starts clean). The engine is PGlite:
 * in the SQL runner worker (from the CDN) and in Node for content validation.
 */

export interface SqlEngine {
  exec(sql: string): Promise<unknown>
  query(sql: string, params?: unknown[], options?: { rowMode?: 'array' | 'object' }): Promise<{ fields: Array<{ name: string }>; rows: unknown[] }>
}

/** One statement only: strip comments and a trailing semicolon, reject more. */
export function singleStatement(code: string): { ok: true; sql: string } | { ok: false; error: string } {
  const stripped = code
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .replace(/;\s*$/, '')
    .trim()
  if (!stripped) return { ok: false, error: 'Write a SELECT statement.' }
  // A semicolon outside string literals means a second statement.
  const outsideStrings = stripped.replace(/'(?:[^']|'')*'/g, "''")
  if (outsideStrings.includes(';')) return { ok: false, error: 'Submit exactly one statement (no semicolons between statements).' }
  if (!/^(select|with)\b/i.test(stripped)) return { ok: false, error: 'Only a SELECT (or WITH … SELECT) query is accepted.' }
  return { ok: true, sql: stripped }
}

export async function runSqlCase(engine: SqlEngine, schema: string, seed: string, sql: string): Promise<CaseOutcome> {
  const t0 = performance.now()
  await engine.exec('BEGIN')
  try {
    await engine.exec(schema)
    if (seed.trim()) await engine.exec(seed)
    const qt = performance.now()
    const res = await engine.query(sql, [], { rowMode: 'array' })
    const output: SqlResult = normalizeSqlCells({ columns: res.fields.map((f) => f.name), rows: res.rows as unknown[][] })
    return { ok: true, output, ms: performance.now() - qt }
  } catch (err) {
    return { ok: false, error: errorMessage(err).replace(/^error: /i, ''), ms: performance.now() - t0 }
  } finally {
    await engine.exec('ROLLBACK').catch(() => undefined)
  }
}

export async function runSqlCases(engine: SqlEngine, schema: string, datasets: readonly string[], code: string): Promise<{ compileError: string | null; cases: CaseOutcome[] }> {
  const one = singleStatement(code)
  if (!one.ok) return { compileError: one.error, cases: [] }
  const cases: CaseOutcome[] = []
  for (const seed of datasets) cases.push(await runSqlCase(engine, schema, seed, one.sql))
  // A syntax error fails every case the same way: report it as a compile error.
  const first = cases[0]
  if (first && !first.ok && /syntax error/i.test(first.error) && cases.every((c) => !c.ok)) {
    return { compileError: first.error, cases: [] }
  }
  return { compileError: null, cases }
}
