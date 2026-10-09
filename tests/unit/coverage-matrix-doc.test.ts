import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { coverageMatrix, matrixMarkdown, matrixStatus } from '@/lib/coverage/matrix'

/** Every column but the last (fixture postings, computed by the script with the gate). */
function shape(table: string): string[] {
  return table
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split('|').slice(1, -2).map((c) => c.trim()).join('|'))
}

describe('coverage matrix in docs/job-sources.md', () => {
  it('matches the shipped data (run `pnpm tsx scripts/coverage-matrix.ts --write` after changing sources)', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'job-sources.md'), 'utf8').replace(/\r\n/g, '\n')
    const block = doc.split('<!-- coverage-matrix:start -->')[1]?.split('<!-- coverage-matrix:end -->')[0] ?? ''
    expect(shape(block)).toEqual(shape(matrixMarkdown(coverageMatrix())))
  })

  it('Kuwait is no longer red: it ships automatic employer boards', () => {
    const kw = coverageMatrix().find((r) => r.id === 'kw')!
    expect(kw.boardsOn).toBeGreaterThanOrEqual(5)
    expect(matrixStatus(kw)).not.toBe('red')
  })
})
