/**
 * Decision provider interface. Narrow-purpose classification/scoring —
 * think "pick one from this list" or "yes/no with confidence", not
 * free-form generation. Callers write the schema, providers deliver the
 * answer.
 *
 * Implementations:
 *   - lib/decisions/groq.ts       — default; Groq JSON mode over Llama family
 *   - lib/decisions/heuristic.ts  — deterministic keyword-map fallback
 *   - lib/decisions/laya-http.ts  — deferred v8.1 stub for a Laya HF Space
 *
 * `getDecisionProvider()` in ./index.ts composes these based on the
 * DECISION_PROVIDER env var and layers heuristic-on-failure fallback so a
 * caller never has to catch provider errors themselves.
 */

export interface ChoiceInput<T extends string> {
  text: string
  options: readonly T[]
  /** Optional extra context (e.g. category descriptions, examples). */
  context?: string
}

export interface ChoiceResult<T extends string> {
  pick: T
  confidence: number
}

export interface YesNoInput {
  text: string
  question: string
  context?: string
}

export interface YesNoResult {
  answer: boolean
  confidence: number
}

export interface ScoreInput {
  text: string
  rubric: string
  /** Inclusive numeric bounds. Defaults to [0, 1]. */
  scale?: [number, number]
  context?: string
}

export interface ScoreResult {
  score: number
}

export interface DecisionProvider {
  /** Return the enum value that best matches `text`. Confidence 0..1. */
  choice<T extends string>(input: ChoiceInput<T>): Promise<ChoiceResult<T>>
  yesNo(input: YesNoInput): Promise<YesNoResult>
  score(input: ScoreInput): Promise<ScoreResult>
}

/**
 * Thrown by the Laya HTTP stub in v8. Callers of `getDecisionProvider()`
 * never see it because the composed provider catches it and falls back to
 * Groq → heuristic. Kept exported so tests can assert the failure mode.
 */
export class LayaUnavailableError extends Error {
  constructor(message = 'Laya provider is not yet enabled (v8.1)') {
    super(message)
    this.name = 'LayaUnavailableError'
  }
}
