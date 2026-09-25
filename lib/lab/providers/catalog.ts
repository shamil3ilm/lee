import type { ProviderId, ProviderInfo } from './types'

/**
 * v14 — static provider catalogue. Client-safe (no secrets, no I/O).
 * Base URLs / auth / model-list endpoints verified against each provider's
 * official docs on 2026-09-25 (see `verified`).
 */
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'groq',
    label: 'Groq',
    runsIn: 'server',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    docsUrl: 'https://console.groq.com/docs/openai',
    keyUrl: 'https://console.groq.com/keys',
    freeTierNote: 'Free developer tier with per-model RPM/TPM limits.',
    verified: true,
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    runsIn: 'server',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    docsUrl: 'https://openrouter.ai/docs/api-reference/overview',
    keyUrl: 'https://openrouter.ai/settings/keys',
    freeTierNote: 'Models ending in :free cost $0 but are heavily rate-limited.',
    verified: true,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    runsIn: 'server',
    baseUrl: 'https://api.cerebras.ai/v1',
    needsKey: true,
    docsUrl: 'https://inference-docs.cerebras.ai/resources/openai',
    keyUrl: 'https://cloud.cerebras.ai/',
    freeTierNote: 'Free tier with daily token limits; very high tokens/sec.',
    verified: true,
  },
  {
    id: 'google',
    label: 'Google AI Studio',
    runsIn: 'server',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeTierNote: 'Free tier for Gemini Flash / Gemma models (OpenAI-compat layer is beta).',
    verified: true,
    envKey: 'GEMINI_API_KEY',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    runsIn: 'server',
    baseUrl: 'https://router.huggingface.co/v1',
    needsKey: true,
    docsUrl: 'https://huggingface.co/docs/inference-providers/index',
    keyUrl: 'https://huggingface.co/settings/tokens',
    freeTierNote: 'Small monthly free credit across Inference Providers.',
    verified: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (your machine)',
    runsIn: 'browser',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    freeTierNote: 'Free and local. Requires OLLAMA_ORIGINS to allow this site (coming in 14.4).',
    verified: true,
    comingSoon: true,
  },
  {
    id: 'webllm',
    label: 'WebLLM (in-browser)',
    runsIn: 'browser',
    needsKey: false,
    docsUrl: 'https://webllm.mlc.ai/',
    freeTierNote: 'Runs on your GPU via WebGPU; no key, no server (coming in 14.4).',
    verified: false,
    comingSoon: true,
  },
] as const

export function getProviderInfo(id: ProviderId): ProviderInfo {
  const p = PROVIDERS.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

/** Providers the server-side Arena can call in this phase. */
export const ARENA_PROVIDER_IDS: ProviderId[] = PROVIDERS.filter(
  (p) => p.runsIn === 'server' && !p.comingSoon,
).map((p) => p.id)

/**
 * Curated picks surfaced first in the model picker. Only shown when the live
 * `/models` list actually contains the id — so a stale entry here simply
 * disappears instead of offering a model that no longer exists.
 */
export const RECOMMENDED: Readonly<Record<ProviderId, readonly string[]>> = {
  groq: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b'],
  openrouter: [
    'openai/gpt-oss-20b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'qwen/qwen3-coder:free',
    'google/gemma-3-27b-it:free',
  ],
  cerebras: ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-32b'],
  google: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemma-3-27b-it'],
  huggingface: ['openai/gpt-oss-120b', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-32B'],
  ollama: [],
  webllm: [],
}

/** OpenRouter attribution headers; `HTTP-Referer` is added from NEXTAUTH_URL at call time. */
export const OPENROUTER_APP_HEADERS: Readonly<Record<string, string>> = {
  'X-Title': 'Employ Model Lab',
  'X-OpenRouter-Title': 'Employ Model Lab',
}
