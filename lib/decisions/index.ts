import { env } from '@/lib/env'
import { HeuristicDecisionProvider } from './heuristic'
import { GroqDecisionProvider } from './groq'
import { LayaHttpDecisionProvider } from './laya-http'
import * as profileQ from '@/lib/db/queries/profile'
import type {
  ChoiceInput,
  ChoiceResult,
  DecisionProvider,
  ScoreInput,
  ScoreResult,
  YesNoInput,
  YesNoResult,
} from './types'

/** Enum values accepted for `user_profile.decision_provider`. Mirrors env. */
type DecisionProviderKind = 'groq' | 'heuristic' | 'laya'

function isDecisionProviderKind(v: string | null | undefined): v is DecisionProviderKind {
  return v === 'groq' || v === 'heuristic' || v === 'laya'
}

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
 * Build a decision provider from an explicit `kind` + `layaEndpoint`.
 * Same fallback shape as before:
 *   - `groq`      → Groq → heuristic fallback
 *   - `heuristic` → heuristic directly (never fails)
 *   - `laya`      → laya-http → Groq → heuristic
 *
 * When GROQ_API_KEY is missing but the caller asked for a Groq path, the
 * factory silently downgrades to heuristic-only rather than crashing at
 * boot; individual calls stay functional with reduced quality.
 */
function buildDecisionProvider(
  kind: DecisionProviderKind,
  layaEndpoint: string | undefined,
): DecisionProvider {
  const heuristic = new HeuristicDecisionProvider()
  if (kind === 'heuristic') return heuristic

  const chain: DecisionProvider[] = []
  if (kind === 'laya') {
    // LayaHttpDecisionProvider defaults to the public demo Space when no
    // endpoint is set, so we no longer gate on layaEndpoint being present.
    chain.push(new LayaHttpDecisionProvider(layaEndpoint, env.LAYA_API_KEY))
  }
  if (env.GROQ_API_KEY) {
    chain.push(new GroqDecisionProvider(env.GROQ_API_KEY))
  }
  chain.push(heuristic)

  return new ChainedDecisionProvider(chain)
}

/**
 * User-scoped factory. Reads `user_profile.decisionProvider` +
 * `user_profile.layaEndpoint` first; any null value falls back to the
 * corresponding env default. Callers on user-facing paths should use this
 * so the UI dropdown actually takes effect.
 *
 * When `userId` is omitted (fixtures, cron/health checks, background jobs
 * with no user), the env values are used directly — identical to the old
 * env-only behavior.
 */
export async function getDecisionProviderForUser(
  userId?: string,
): Promise<DecisionProvider> {
  if (!userId) return getDecisionProvider()

  const profile = await profileQ.get(userId).catch(() => null)
  const rawKind = profile?.decisionProvider
  const kind: DecisionProviderKind = isDecisionProviderKind(rawKind)
    ? rawKind
    : (env.DECISION_PROVIDER ?? 'groq')
  const layaEndpoint = profile?.layaEndpoint ?? env.LAYA_ENDPOINT
  return buildDecisionProvider(kind, layaEndpoint)
}

/**
 * Env-only factory. Retained for tests, health checks, cron paths and any
 * background job without a user context.
 *
 * @deprecated Prefer `getDecisionProviderForUser(userId)` on user-facing
 * request paths so the user's saved provider preference is respected.
 */
export function getDecisionProvider(): DecisionProvider {
  const kind: DecisionProviderKind = env.DECISION_PROVIDER ?? 'groq'
  return buildDecisionProvider(kind, env.LAYA_ENDPOINT)
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
