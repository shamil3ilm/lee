import { env } from '@/lib/env'
import { HeuristicDecisionProvider } from './heuristic'
import { GroqDecisionProvider } from './groq'
import { LayaHttpDecisionProvider } from './laya-http'
import * as profileQ from '@/lib/db/queries/profile'
import { resolveAiKey, resolveServiceSecret } from '@/lib/settings/secrets'
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
 * One link in the fallback chain. A bare provider is shorthand for
 * `{ provider }`.
 *
 * - `minAnswerProbability`: answers whose probability of the reported answer
 *   falls below this are treated as tentative — the chain keeps them and asks
 *   the next provider. Used for Laya, whose README reports zero-shot accuracy
 *   below the majority-class baseline and checkpoints that ship over-confident.
 * - `lastResort`: a provider (the heuristic) that should only answer when no
 *   earlier provider produced even a tentative answer.
 */
export type ChainEntry = {
  provider: DecisionProvider
  minAnswerProbability?: number
  lastResort?: boolean
}

type DecisionKind = 'choice' | 'yesNo' | 'score'

/**
 * Probability that the reported answer is right, on one scale for every
 * decision kind. Choice confidence already is P(pick); yes/no confidence is
 * |p − 0.5| · 2, so P(answer) = 0.5 + confidence / 2. Score answers carry no
 * confidence and are never gated.
 */
function answerProbability(kind: DecisionKind, result: unknown): number | null {
  if (kind === 'score') return null
  const c = (result as { confidence?: unknown }).confidence
  if (typeof c !== 'number' || !Number.isFinite(c)) return null
  return kind === 'yesNo' ? 0.5 + c / 2 : c
}

/**
 * Compose one provider with a fallback chain. Any thrown error from the
 * primary triggers the next provider; the last provider is expected to
 * never throw (heuristic satisfies that guarantee). A gated provider's
 * low-confidence answer also moves on, but is kept and preferred over a
 * last-resort provider.
 *
 * The composition is opaque to callers — they see a single DecisionProvider
 * whose `choice/yesNo/score` never surface transient upstream failures.
 */
class ChainedDecisionProvider implements DecisionProvider {
  private readonly chain: readonly ChainEntry[]

  constructor(chain: ReadonlyArray<DecisionProvider | ChainEntry>) {
    if (chain.length === 0) throw new Error('ChainedDecisionProvider: empty chain')
    this.chain = chain.map((e) => ('provider' in e ? e : { provider: e }))
  }

  async choice<T extends string>(input: ChoiceInput<T>): Promise<ChoiceResult<T>> {
    return this.runChain('choice', (p) => p.choice(input))
  }
  async yesNo(input: YesNoInput): Promise<YesNoResult> {
    return this.runChain('yesNo', (p) => p.yesNo(input))
  }
  async score(input: ScoreInput): Promise<ScoreResult> {
    return this.runChain('score', (p) => p.score(input))
  }

  private async runChain<R>(
    kind: DecisionKind,
    fn: (p: DecisionProvider) => Promise<R>,
  ): Promise<R> {
    let lastError: unknown
    let tentative: { value: R } | null = null
    for (const entry of this.chain) {
      if (entry.lastResort && tentative) return tentative.value
      try {
        const result = await fn(entry.provider)
        const prob = answerProbability(kind, result)
        const gated =
          entry.minAnswerProbability !== undefined &&
          prob !== null &&
          prob < entry.minAnswerProbability
        if (!gated) return result
        tentative ??= { value: result }
      } catch (e) {
        lastError = e
      }
    }
    if (tentative) return tentative.value
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
 * When no Groq key (saved or env) is available but a Groq path was asked, the
 * factory silently downgrades to heuristic-only rather than crashing at
 * boot; individual calls stay functional with reduced quality.
 */
/**
 * Below this probability of the reported answer, a Laya answer is only
 * tentative and Groq is asked too. Laya's README says thresholds must be
 * fitted on your own held-out data and don't transfer from Jev; until the
 * Model Lab (v14) can fit one per question, 0.7 is a conservative default.
 */
const LAYA_MIN_ANSWER_PROBABILITY = 0.7

interface DecisionKeys {
  groqKey: string | null | undefined
  layaKey: string | null | undefined
}

function buildDecisionProvider(
  kind: DecisionProviderKind,
  layaEndpoint: string | undefined,
  keys: DecisionKeys,
): DecisionProvider {
  const heuristic = new HeuristicDecisionProvider()
  if (kind === 'heuristic') return heuristic

  const chain: ChainEntry[] = []
  if (kind === 'laya') {
    // LayaHttpDecisionProvider defaults to the public demo Space when no
    // endpoint is set, so we no longer gate on layaEndpoint being present.
    chain.push({
      provider: new LayaHttpDecisionProvider(layaEndpoint, keys.layaKey ?? undefined),
      minAnswerProbability: LAYA_MIN_ANSWER_PROBABILITY,
    })
  }
  if (keys.groqKey) {
    chain.push({ provider: new GroqDecisionProvider(keys.groqKey) })
  }
  chain.push({ provider: heuristic, lastResort: true })

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

  const [profile, groqKey, laya] = await Promise.all([
    profileQ.get(userId).catch(() => null),
    // Saved Settings › AI keys win; env keys are the fallback. A failed
    // lookup degrades to env rather than breaking the decision call.
    resolveAiKey(userId, 'groq').catch(() => env.GROQ_API_KEY ?? null),
    resolveServiceSecret(userId, 'laya').catch(() => ({ key: env.LAYA_API_KEY ?? null })),
  ])
  const rawKind = profile?.decisionProvider
  const kind: DecisionProviderKind = isDecisionProviderKind(rawKind)
    ? rawKind
    : (env.DECISION_PROVIDER ?? 'groq')
  const layaEndpoint = profile?.layaEndpoint ?? env.LAYA_ENDPOINT
  return buildDecisionProvider(kind, layaEndpoint, { groqKey, layaKey: laya.key })
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
  return buildDecisionProvider(kind, env.LAYA_ENDPOINT, {
    groqKey: env.GROQ_API_KEY,
    layaKey: env.LAYA_API_KEY,
  })
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
