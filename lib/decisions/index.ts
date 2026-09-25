import { env } from '@/lib/env'
import { HeuristicDecisionProvider } from './heuristic'
import { GroqDecisionProvider } from './groq'
import { LayaHttpDecisionProvider } from './laya-http'
import type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'

/**
 * Compose one provider with a fallback chain. Any thrown error from the
 * primary triggers the next provider; the last provider is expected to
 * never throw (heuristic satisfies that guarantee).
 *
 * The composition is opaque to callers — they see a single DecisionProvider
 * whose `choice/yesNo/score` never surface transient upstream failures.
 */
class ChainedDecisionProvider implements DecisionProvider {
  constructor(private readonly chain: DecisionProvider[]) {
    if (chain.length === 0) throw new Error('ChainedDecisionProvider: empty chain')
  }

  async choice<T extends string>(input: ChoiceInput<T>): Promise<ChoiceResult<T>> {
    return this.runChain((p) => p.choice(input))
  }
  async yesNo(input: YesNoInput): Promise<YesNoResult> {
    return this.runChain((p) => p.yesNo(input))
  }
  async score(input: ScoreInput): Promise<ScoreResult> {
    return this.runChain((p) => p.score(input))
  }

  private async runChain<R>(fn: (p: DecisionProvider) => Promise<R>): Promise<R> {
    let lastError: unknown
    for (const p of this.chain) {
      try {
        return await fn(p)
      } catch (e) {
        lastError = e
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('decision provider chain exhausted')
  }
}

/**
 * Env-driven factory:
 *   - `groq` (default) → Groq → heuristic fallback
 *   - `heuristic`      → heuristic directly (never fails)
 *   - `laya`           → laya-http → Groq → heuristic (v8.1 activation path)
 *
 * When GROQ_API_KEY is missing but the caller asked for a Groq path, the
 * factory silently downgrades to heuristic-only rather than crashing at
 * boot; individual calls stay functional with reduced quality.
 */
export function getDecisionProvider(): DecisionProvider {
  const provider = env.DECISION_PROVIDER ?? 'groq'
  const heuristic = new HeuristicDecisionProvider()

  if (provider === 'heuristic') return heuristic

  const chain: DecisionProvider[] = []
  if (provider === 'laya') {
    if (env.LAYA_ENDPOINT) {
      chain.push(new LayaHttpDecisionProvider(env.LAYA_ENDPOINT, env.LAYA_API_KEY))
    }
  }
  if (env.GROQ_API_KEY) {
    chain.push(new GroqDecisionProvider(env.GROQ_API_KEY))
  }
  chain.push(heuristic)

  return new ChainedDecisionProvider(chain)
}

export { HeuristicDecisionProvider, GroqDecisionProvider, LayaHttpDecisionProvider }
export { LayaUnavailableError } from './types'
export type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'
// Internal — exported for tests only. Do not depend on the class shape.
export const _internal = { ChainedDecisionProvider }
