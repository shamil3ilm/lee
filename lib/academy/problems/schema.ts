import { z } from 'zod'
import {
  CODE_LANGUAGES,
  FUNCTION_LANGUAGES,
  LANGUAGE_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  TOPICS,
  ROLES,
  BIG_O,
  VALUE_TYPES,
  RESERVED_SLUGS,
  type CodeLanguage,
  type Difficulty,
  type Topic,
  type Role,
  type BigO,
  type ValueType,
} from './constants'

/**
 * Zod schemas for the coding problem set (v13 phase 13.1), versioned content
 * under `content/academy/problems/`. The full problem (hidden tests and the
 * reference solution included) is server-only; browsers get the projection in
 * ./public.ts. Pure and client-safe (types and enums only carry no content).
 */

export {
  CODE_LANGUAGES,
  FUNCTION_LANGUAGES,
  LANGUAGE_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  TOPICS,
  ROLES,
  BIG_O,
  VALUE_TYPES,
  RESERVED_SLUGS,
  type CodeLanguage,
  type Difficulty,
  type Topic,
  type Role,
  type BigO,
  type ValueType,
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,59}$/
const IDENT = /^[a-z][A-Za-z0-9]{0,39}$/
const text = (max: number) => z.string().trim().min(1).max(max)

const valueSpecSchema = z.object({
  name: z.string().regex(IDENT),
  type: z.enum(VALUE_TYPES),
  /** Optional precise TypeScript type (e.g. "Array<{ id: string; amount: number }>"). */
  tsType: text(200).optional(),
})
export type ValueSpec = z.infer<typeof valueSpecSchema>

export const functionSpecSchema = z.object({
  name: z.string().regex(IDENT),
  params: z.array(valueSpecSchema).min(1).max(6),
  returns: valueSpecSchema.omit({ name: true }),
})
export type FunctionSpec = z.infer<typeof functionSpecSchema>

export const compareSchema = z.object({
  /** exact: deep equality; unordered: the top-level array in any order. */
  mode: z.enum(['exact', 'unordered']).default('exact'),
  /** Absolute tolerance for numbers (anywhere in the value). */
  tolerance: z.number().min(0).max(1).optional(),
  /** Also ignore order inside each top-level element (for lists of groups). */
  unorderedInner: z.boolean().optional(),
})
export type CompareSpec = z.infer<typeof compareSchema>

export const functionTestSchema = z.object({
  args: z.array(z.unknown()),
  expected: z.unknown(),
  /** Shown under a sample (never used for hidden tests). */
  explanation: text(400).optional(),
})
export type FunctionTest = z.infer<typeof functionTestSchema>

export const sqlResultSchema = z.object({
  columns: z.array(text(60)).min(1),
  rows: z.array(z.array(z.unknown())),
})
export type SqlResult = z.infer<typeof sqlResultSchema>

export const sqlTestSchema = z.object({
  /** INSERT statements run after the schema. */
  seed: z.string().max(20_000),
  expected: sqlResultSchema,
  explanation: text(400).optional(),
})
export type SqlTest = z.infer<typeof sqlTestSchema>

/** Scaled-input generators for the empirical complexity fit (lib/academy/runner/generate.ts). */
export type GenSpec =
  | { t: 'n'; mul?: number; add?: number }
  | { t: 'const'; value: unknown }
  | { t: 'ints'; len?: number; min: number; max: number; distinct?: boolean; sorted?: boolean }
  | { t: 'str'; len?: number; alphabet: string }
  | { t: 'strs'; len?: number; wordLen: number; alphabet: string }
  | { t: 'intervals'; len?: number; maxLen: number }
  | { t: 'tree' }
  | { t: 'edges'; extra?: number }
  | { t: 'objs'; len?: number; fields: Record<string, GenField> }

export type GenField =
  | { t: 'seq'; prefix?: string }
  | { t: 'int'; min: number; max: number }
  | { t: 'pick'; values: readonly unknown[] }
  | { t: 'ascInt'; step: number }

const genFieldSchema: z.ZodType<GenField> = z.union([
  z.object({ t: z.literal('seq'), prefix: z.string().max(20).optional() }),
  z.object({ t: z.literal('int'), min: z.number().int(), max: z.number().int() }),
  z.object({ t: z.literal('pick'), values: z.array(z.unknown()).min(1).max(50) }),
  z.object({ t: z.literal('ascInt'), step: z.number().int().min(1) }),
])

export const genSpecSchema: z.ZodType<GenSpec> = z.union([
  z.object({ t: z.literal('n'), mul: z.number().optional(), add: z.number().optional() }),
  z.object({ t: z.literal('const'), value: z.unknown() }),
  z.object({
    t: z.literal('ints'),
    len: z.number().int().min(0).optional(),
    min: z.number().int(),
    max: z.number().int(),
    distinct: z.boolean().optional(),
    sorted: z.boolean().optional(),
  }),
  z.object({ t: z.literal('str'), len: z.number().int().min(0).optional(), alphabet: z.string().min(1).max(64) }),
  z.object({
    t: z.literal('strs'),
    len: z.number().int().min(0).optional(),
    wordLen: z.number().int().min(1).max(32),
    alphabet: z.string().min(1).max(64),
  }),
  z.object({ t: z.literal('intervals'), len: z.number().int().min(0).optional(), maxLen: z.number().int().min(1) }),
  z.object({ t: z.literal('tree') }),
  z.object({ t: z.literal('edges'), extra: z.number().min(0).max(4).optional() }),
  z.object({ t: z.literal('objs'), len: z.number().int().min(0).optional(), fields: z.record(z.string(), genFieldSchema) }),
]) as z.ZodType<GenSpec>

const baseProblem = {
  slug: z
    .string()
    .regex(SLUG)
    .refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'slug is reserved'),
  title: text(80),
  difficulty: z.enum(DIFFICULTIES),
  /** Difficulty on the skill rating scale (Glicko game against the problem). */
  rating: z.number().int().min(800).max(2400),
  /** The skill a submission rates (content/academy/skills.json). */
  skillId: z.string().min(1),
  topics: z.array(z.enum(TOPICS)).min(1).max(5),
  roles: z.array(z.enum(ROLES)).max(4).default([]),
  /** Markdown, written for lee (never copied from another site). */
  statement: text(4000),
  constraints: z.array(text(200)).min(1).max(10),
  hints: z.array(text(400)).min(1).max(4),
  complexity: z.object({ time: z.enum(BIG_O), space: z.enum(BIG_O) }),
  parSec: z.number().int().min(120).max(3600),
  reference: z.object({ code: text(6000), approach: text(1500) }),
}

export const functionProblemSchema = z.object({
  ...baseProblem,
  kind: z.literal('function'),
  fn: functionSpecSchema,
  compare: compareSchema.default({ mode: 'exact' }),
  samples: z.array(functionTestSchema).min(1).max(4),
  hidden: z.array(functionTestSchema).min(4).max(40),
  scale: z.object({ args: z.array(genSpecSchema).min(1).max(6) }).optional(),
  /** Per-language starter code overrides (otherwise generated from `fn`). */
  starter: z.partialRecord(z.enum(FUNCTION_LANGUAGES), text(2000)).optional(),
})
export type FunctionProblem = z.infer<typeof functionProblemSchema>

export const sqlProblemSchema = z.object({
  ...baseProblem,
  kind: z.literal('sql'),
  /** CREATE TABLE statements; shown to the user. */
  schema: text(4000),
  /** Row order matters (the statement asks for an ORDER BY). */
  ordered: z.boolean(),
  samples: z.array(sqlTestSchema).min(1).max(3),
  hidden: z.array(sqlTestSchema).min(3).max(20),
  starter: z.string().max(2000).optional(),
})
export type SqlProblem = z.infer<typeof sqlProblemSchema>

export const problemSchema = z.discriminatedUnion('kind', [functionProblemSchema, sqlProblemSchema])
export type Problem = z.infer<typeof problemSchema>
/** What content files are written as (defaults not yet applied). */
export type ProblemSource = z.input<typeof problemSchema>

export const studyPlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  title: text(60),
  description: text(300),
  problems: z.array(z.string().regex(SLUG)).min(3).max(60),
})
export type StudyPlan = z.infer<typeof studyPlanSchema>

export function languagesFor(p: Pick<Problem, 'kind'>): readonly CodeLanguage[] {
  return p.kind === 'sql' ? ['sql'] : FUNCTION_LANGUAGES
}
