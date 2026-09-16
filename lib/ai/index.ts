import { env } from '@/lib/env'
import type { AIProvider } from './types'
import { GeminiProvider } from './gemini'
import { GroqProvider } from './groq'
import { findModel, MODEL_REGISTRY, type ModelChoice } from './registry'
import * as profileQ from '@/lib/db/queries/profile'

function build(choice: ModelChoice): AIProvider {
  switch (choice.provider) {
    case 'gemini':
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
      return new GeminiProvider(env.GEMINI_API_KEY, choice.model)
    case 'groq':
      if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
      return new GroqProvider(env.GROQ_API_KEY, choice.model)
  }
}

// Env fallback (used by fixtures / non-user code paths / initial bootstrap).
export function getAIProvider(): AIProvider {
  const envChoice = MODEL_REGISTRY.find((m) => m.provider === env.AI_PROVIDER)
  if (!envChoice) {
    throw new Error(
      `No AI model in registry for AI_PROVIDER=${env.AI_PROVIDER}. Available: ${MODEL_REGISTRY.map((m) => m.id).join(', ')}`,
    )
  }
  return build(envChoice)
}

// User-scoped: reads model choice from user_profile.aiProvider + aiModel,
// falls back to env default. Every user-facing AI call site should use this
// so a user's dropdown pick actually takes effect.
export async function getAIProviderForUser(userId: string): Promise<AIProvider> {
  const profile = await profileQ.get(userId)
  const picked =
    findModel(
      profile?.aiProvider && profile?.aiModel
        ? `${profile.aiProvider}:${profile.aiModel}`
        : null,
    ) ?? findMatchingRegistryEntry(profile?.aiProvider, profile?.aiModel)
  if (picked) return build(picked)
  return getAIProvider()
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
