/**
 * v14 — Model Lab provider registry types. Shared by server (adapter,
 * registry, routes) and client (arena UI) — keep this file free of runtime
 * imports so it can be pulled into client bundles safely.
 */

export const PROVIDER_IDS = [
  'groq',
  'openrouter',
  'cerebras',
  'google',
  'huggingface',
  'ollama',
  'webllm',
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export interface ModelRef {
  provider: ProviderId
  model: string
}

export interface ProviderInfo {
  id: ProviderId
  label: string
  runsIn: 'server' | 'browser'
  baseUrl?: string
  needsKey: boolean
  docsUrl: string
  keyUrl?: string
  freeTierNote: string
  /** Base URL / auth / models endpoint checked against official docs. */
  verified: boolean
  /** Not callable from the Arena yet (in-browser/local providers land in 14.4). */
  comingSoon?: boolean
  /** Env var that can supply a fallback key. */
  envKey?: 'GROQ_API_KEY' | 'GEMINI_API_KEY'
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  system?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  jsonSchema?: object
}

export interface ChatMetrics {
  ttftMs?: number
  totalMs: number
  inputTokens?: number
  outputTokens?: number
  tokensPerSec?: number
}

export interface ChatResult {
  text: string
  metrics: ChatMetrics
}

export interface ModelInfo {
  id: string
  label: string
  contextLength?: number
  free?: boolean
  recommended?: boolean
}

export type KeySource = 'db' | 'env' | 'none'
