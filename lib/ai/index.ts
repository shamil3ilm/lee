import { env } from '@/lib/env'
import type { AIProvider } from './types'
import { GeminiProvider } from './gemini'
import { GroqProvider } from './groq'
import { OllamaProvider, ollamaConfig } from './ollama'
import { findModel, MODEL_REGISTRY, type ModelChoice } from './registry'
import * as profileQ from '@/lib/db/queries/profile'
import { resolveAiKey } from '@/lib/settings/secrets'
import { isTestLoginEnabled } from '@/lib/auth/test-login-guard'

/** E2E_AI_FIXTURES=1 with the local test sign-in enabled (never on Vercel or in production). */
export function e2eAiFixturesEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return isTestLoginEnabled(env) && env.E2E_AI_FIXTURES === '1'
}

const MISSING_KEY: Record<Exclude<ModelChoice['provider'], 'ollama'>, string> = {
  gemini: 'No Gemini key: add a Google AI Studio key in Settings › AI (or set GEMINI_API_KEY).',
  groq: 'No Groq key: add one in Settings › AI (or set GROQ_API_KEY).',
}

const OLLAMA_NOT_CONFIGURED =
  'The local model needs an Ollama server: set OLLAMA_BASE_URL (and OLLAMA_MODEL), or pick another model in Settings › AI.'

/** `key` is the resolved key (user's saved key, else env); null → friendly error. */
function build(choice: ModelChoice, key: string | null | undefined): AIProvider {
  if (choice.provider === 'ollama') {
    const config = ollamaConfig()
    if (!config) throw new Error(OLLAMA_NOT_CONFIGURED)
    return new OllamaProvider(config)
  }
  if (!key) throw new Error(MISSING_KEY[choice.provider])
  switch (choice.provider) {
    case 'gemini':
      return new GeminiProvider(key, choice.model)
    case 'groq':
      return new GroqProvider(key, choice.model)
  }
}

function envKeyFor(provider: ModelChoice['provider']): string | undefined {
  if (provider === 'ollama') return undefined
  return provider === 'gemini' ? env.GEMINI_API_KEY : env.GROQ_API_KEY
}

function envChoice(): ModelChoice {
  const choice = MODEL_REGISTRY.find((m) => m.provider === env.AI_PROVIDER)
  if (!choice) {
    throw new Error(
      `No AI model in registry for AI_PROVIDER=${env.AI_PROVIDER}. Available: ${MODEL_REGISTRY.map((m) => m.id).join(', ')}`,
    )
  }
  return choice
}

// Env fallback (used by fixtures / non-user code paths / initial bootstrap).
export function getAIProvider(): AIProvider {
  const choice = envChoice()
  return build(choice, envKeyFor(choice.provider))
}

// User-scoped: model choice from user_profile.aiProvider + aiModel (env
// AI_PROVIDER when unset) and the API key the user saved in Settings › AI
// (env key when unset). Every user-facing AI call site should use this so
// both the dropdown and the saved keys actually take effect.
export async function getAIProviderForUser(userId: string): Promise<AIProvider> {
  // Local E2E only: deterministic fixture AI (lib/ai/fixtures.ts) so journeys
  // that generate documents run without a real key. The literal NODE_ENV
  // check folds to false in production builds; the test sign-in guard adds
  // the same VERCEL / E2E_TEST_LOGIN conditions.
  if (process.env.NODE_ENV !== 'production' && e2eAiFixturesEnabled(process.env)) {
    const { FixtureAIProvider } = await import('./fixtures')
    return new FixtureAIProvider()
  }
  const profile = await profileQ.get(userId)
  const picked =
    findModel(
      profile?.aiProvider && profile?.aiModel
        ? `${profile.aiProvider}:${profile.aiModel}`
        : null,
    ) ?? findMatchingRegistryEntry(profile?.aiProvider, profile?.aiModel)
  const choice = picked ?? envChoice()
  const key = choice.provider === 'ollama' ? null : await resolveAiKey(userId, choice.provider)
  return build(choice, key)
}

// Backwards match: earlier saves may have stored raw provider + model rather
// than a registry id. Look up by the combination.
function findMatchingRegistryEntry(
  provider: string | null | undefined,
  model: string | null | undefined,
): ModelChoice | null {
  if (!provider || !model) return null
  return (
    MODEL_REGISTRY.find((m) => m.provider === provider && m.model === model) ?? null
  )
}

export type { AIProvider } from './types'
export { MODEL_REGISTRY, DEFAULT_MODEL_ID, findModel } from './registry'
export type { ModelChoice } from './registry'
