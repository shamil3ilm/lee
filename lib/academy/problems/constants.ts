/**
 * Problem-set constants and their types, with no zod: client components
 * import from here so the schema library stays out of their bundles.
 * lib/academy/problems/schema.ts re-exports everything. Pure.
 */

export const CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'php', 'sql'] as const
export type CodeLanguage = (typeof CODE_LANGUAGES)[number]

export const FUNCTION_LANGUAGES = ['javascript', 'typescript', 'python', 'php'] as const satisfies readonly CodeLanguage[]

export const LANGUAGE_LABELS: Readonly<Record<CodeLanguage, string>> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  php: 'PHP',
  sql: 'SQL',
}

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export const TOPICS = [
  'arrays',
  'hashing',
  'two-pointers',
  'sliding-window',
  'stack',
  'trees',
  'graphs',
  'dp',
  'intervals',
  'strings',
  'sorting',
  'binary-search',
  'heap',
  'greedy',
  'math',
  'design',
  'parsing',
  'sql',
  'reliability',
  'security',
] as const
export type Topic = (typeof TOPICS)[number]

export const ROLES = ['backend', 'payments', 'apis', 'data'] as const
export type Role = (typeof ROLES)[number]

export const BIG_O = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)'] as const
export type BigO = (typeof BIG_O)[number]

/** Parameter and return types; each maps to a TS / Python / PHP type for the starter code. */
export const VALUE_TYPES = [
  'int',
  'float',
  'bool',
  'string',
  'int[]',
  'float[]',
  'string[]',
  'bool[]',
  'int[][]',
  'string[][]',
  'object',
  'object[]',
  'tree',
  'any',
] as const
export type ValueType = (typeof VALUE_TYPES)[number]

/** Paths that are pages under /playground/problems, so never problem slugs. */
export const RESERVED_SLUGS = ['plans', 'mock', 'stats', 'daily', 'random', 'new'] as const
