import { fnNameFor, starterCode } from './starter'
import {
  languagesFor,
  type BigO,
  type CodeLanguage,
  type CompareSpec,
  type Difficulty,
  type FunctionSpec,
  type GenSpec,
  type Problem,
  type Role,
  type SqlResult,
  type Topic,
} from './schema'

/**
 * What the browser may see of a problem. This projection is the leak
 * boundary: hidden tests and the reference solution never cross it (the
 * reference is added only by `solutionView`, after solving or giving up).
 * Hints are revealed one at a time through a server action that records each.
 * Pure. tests/unit/academy-problems-leak.test.ts checks every problem.
 */

export interface PublicSample {
  args: readonly unknown[]
  expected: unknown
  explanation: string | null
}

export interface PublicSqlSample {
  seed: string
  expected: SqlResult
  explanation: string | null
}

interface PublicBase {
  slug: string
  title: string
  difficulty: Difficulty
  rating: number
  skillId: string
  topics: readonly Topic[]
  roles: readonly Role[]
  statement: string
  constraints: readonly string[]
  hintCount: number
  target: { time: BigO; space: BigO }
  parSec: number
  languages: readonly CodeLanguage[]
  starters: Partial<Record<CodeLanguage, string>>
  hiddenCount: number
}

export interface PublicFunctionProblem extends PublicBase {
  kind: 'function'
  fn: FunctionSpec
  fnNames: Partial<Record<CodeLanguage, string>>
  compare: CompareSpec
  samples: readonly PublicSample[]
  scale: { args: readonly GenSpec[] } | null
}

export interface PublicSqlProblem extends PublicBase {
  kind: 'sql'
  schema: string
  ordered: boolean
  samples: readonly PublicSqlSample[]
}

export type PublicProblem = PublicFunctionProblem | PublicSqlProblem

export function toPublicProblem(p: Problem): PublicProblem {
  const languages = languagesFor(p)
  const base: PublicBase = {
    slug: p.slug,
    title: p.title,
    difficulty: p.difficulty,
    rating: p.rating,
    skillId: p.skillId,
    topics: [...p.topics],
    roles: [...p.roles],
    statement: p.statement,
    constraints: [...p.constraints],
    hintCount: p.hints.length,
    target: { ...p.complexity },
    parSec: p.parSec,
    languages,
    starters: Object.fromEntries(languages.map((l) => [l, starterCode(p, l)])),
    hiddenCount: p.hidden.length,
  }
  if (p.kind === 'sql') {
    return {
      ...base,
      kind: 'sql',
      schema: p.schema,
      ordered: p.ordered,
      samples: p.samples.map((s) => ({ seed: s.seed, expected: s.expected, explanation: s.explanation ?? null })),
    }
  }
  return {
    ...base,
    kind: 'function',
    fn: p.fn,
    fnNames: Object.fromEntries(languages.map((l) => [l, fnNameFor(p.fn, l)])),
    compare: p.compare,
    samples: p.samples.map((s) => ({ args: s.args, expected: s.expected, explanation: s.explanation ?? null })),
    scale: p.scale ? { args: p.scale.args } : null,
  }
}

/**
 * The inputs a Submit needs to run the hidden tests in the browser worker.
 * Expected outputs stay on the server, which judges the returned outputs.
 */
export type JudgePack =
  | { kind: 'function'; hiddenArgs: unknown[][]; scale: { args: readonly GenSpec[]; seed: number } | null }
  | { kind: 'sql'; hiddenSeeds: string[] }

export function judgePack(p: Problem, seed: number): JudgePack {
  if (p.kind === 'sql') return { kind: 'sql', hiddenSeeds: p.hidden.map((t) => t.seed) }
  return {
    kind: 'function',
    hiddenArgs: p.hidden.map((t) => [...t.args]),
    scale: p.scale ? { args: p.scale.args, seed } : null,
  }
}

/** The Solution tab: only after an accepted submission or giving up. */
export interface SolutionView {
  language: 'javascript' | 'sql'
  code: string
  approach: string
  target: { time: BigO; space: BigO }
}

export function solutionView(p: Problem): SolutionView {
  return {
    language: p.kind === 'sql' ? 'sql' : 'javascript',
    code: p.reference.code,
    approach: p.reference.approach,
    target: { ...p.complexity },
  }
}
