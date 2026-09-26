import { env } from '@/lib/env'
import type { AIProvider } from './types'
import { GeminiProvider } from './gemini'
import { GroqProvider } from './groq'
import { findModel, MODEL_REGISTRY, type ModelChoice } from './registry'
import * as profileQ from '@/lib/db/queries/profile'
import { resolveAiKey } from '@/lib/settings/secrets'

const MISSING_KEY: Record<ModelChoice['provider'], string> = {
  gemini: 'No Gemini key: add a Google AI Studio key in Settings › AI (or set GEMINI_API_KEY).',
  groq: 'No Groq key: add one in Settings › AI (or set GROQ_API_KEY).',
}

/** `key` is the resolved key (user's saved key, else env); null → friendly error. */
function build(choice: ModelChoice, key: string | null | undefined): AIProvider {
  if (!key) throw new Error(MISSING_KEY[choice.provider])
  switch (choice.provider) {
    case 'gemini':
      return new GeminiProvider(key, choice.model)
    case 'groq':
      return new GroqProvider(key, choice.model)
  }
}

function envKeyFor(provider: ModelChoice['provider']): string | undefined {
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
  const profile = await profileQ.get(userId)
  const picked =
    findModel(
      profile?.aiProvider && profile?.aiModel
        ? `${profile.aiProvider}:${profile.aiModel}`
        : null,
    ) ?? findMatchingRegistryEntry(profile?.aiProvider, profile?.aiModel)
  const choice = picked ?? envChoice()
  return build(choice, await resolveAiKey(userId, choice.provider))
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
