import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import {
  checkExpectations,
  runCvScoreFixture,
  summarize,
  type CvScoreExpect,
  type CvScoreFixtureInputs,
} from '@/tests/eval/cv-score'

/**
 * v12.0 — runs every eval fixture under tests/eval/fixtures/cv-score and
 * enforces its exact `expect` block, so `pnpm test` gates scorer
 * regressions too (not only `pnpm eval`).
 */
const DIR = path.resolve(process.cwd(), 'tests/eval/fixtures/cv-score')
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()

describe('cv-score eval fixtures', () => {
  it('has at least the spec\'s fixture set', () => {
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  it.each(files)('%s meets its exact expectations and is reproducible', async (file) => {
    const fx = JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as {
      inputs: CvScoreFixtureInputs
      expect: CvScoreExpect
    }
    const a = await runCvScoreFixture(fx.inputs, new FixtureAIProvider())
    expect(checkExpectations(a, fx.expect)).toEqual([])
    const b = await runCvScoreFixture(fx.inputs, new FixtureAIProvider())
    expect(summarize(b)).toEqual(summarize(a))
  })
})
