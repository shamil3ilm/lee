// Registry of selectable AI models. Human-friendly labels for the UI
// dropdown. Adding a new model = one entry here. Provider handles the model
// id passed at runtime.

export type ProviderKind = 'gemini' | 'groq' | 'ollama'

export interface ModelChoice {
  id: string                     // stable key stored in user_profile.aiModel
  provider: ProviderKind
  model: string                  // the actual model id the provider accepts
  label: string                  // shown in dropdown
  description: string            // one-line description
  tokensPerSec?: number          // rough throughput indicator
  freeTier: boolean
}

export const MODEL_REGISTRY: ModelChoice[] = [
  // Groq — free-tier open-source models. Fastest and most reliable free tier.
  {
    id: 'groq:gpt-oss-20b',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    label: 'Groq · GPT-OSS 20B',
    description: 'Fastest option (1000 tok/s). Best for structured extraction.',
    tokensPerSec: 1000,
    freeTier: true,
  },
  {
    id: 'groq:gpt-oss-120b',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    label: 'Groq · GPT-OSS 120B',
    description: 'Higher quality, slower (~500 tok/s). Better for CV tailoring.',
    tokensPerSec: 500,
    freeTier: true,
  },
  {
    id: 'groq:compound',
    provider: 'groq',
    model: 'groq/compound',
    label: 'Groq · Compound',
    description: 'Multi-model system with web search + code execution built in.',
    tokensPerSec: 450,
    freeTier: true,
  },
  // Gemini — Google. Free tier is generous but subject to 503 during peaks.
  {
    id: 'gemini:3.6-flash',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    label: 'Gemini · 3.6 Flash',
    description: 'Balanced default. Prone to 503 during peak hours.',
    freeTier: true,
  },
  {
    id: 'gemini:3.6-flash-lite',
    provider: 'gemini',
    model: 'gemini-3.6-flash-lite',
    label: 'Gemini · 3.6 Flash Lite',
    description: 'Lighter/cheaper variant. Usually less loaded than flash.',
    freeTier: true,
  },
  // Ollama — a model you host yourself. The actual model comes from
  // OLLAMA_MODEL; listed only when OLLAMA_BASE_URL is set (selectableModels).
  {
    id: 'ollama:local',
    provider: 'ollama',
    model: 'local',
    label: 'Ollama · Local model',
    description: 'Self-hosted via Ollama (OLLAMA_MODEL). Prompts stay on your own machine or server.',
    freeTier: true,
  },
]

export const DEFAULT_MODEL_ID: ModelChoice['id'] = 'groq:gpt-oss-20b'

export function findModel(id: string | null | undefined): ModelChoice | null {
  if (!id) return null
  return MODEL_REGISTRY.find((m) => m.id === id) ?? null
}

/**
 * Models the picker offers. The local model needs a reachable Ollama server,
 * so it is hidden unless one is configured; a saved choice stays visible so
 * the setting never changes without the user seeing it.
 */
export function selectableModels(opts: { ollama: boolean; keepId?: string | null }): ModelChoice[] {
  return MODEL_REGISTRY.filter(
    (m) => m.provider !== 'ollama' || opts.ollama || m.id === opts.keepId,
  )
}
