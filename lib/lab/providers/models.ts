import { RECOMMENDED } from './catalog'
import type { ModelInfo, ProviderId } from './types'

/**
 * v14 — normalise each provider's `/models` payload into ModelInfo[].
 * Pure; no I/O. Recommended ids (when present) are flagged and sorted first,
 * then free models, then alphabetical.
 */

// Non-chat models that show up in /models lists but can't answer a chat prompt.
const NON_CHAT = /(whisper|tts|orpheus|embed|imagen|veo|aqa|image-generation|guard|moderation|playai|distil-whisper|lyria)/i

interface OpenAIModel {
  id?: unknown
  name?: unknown
  context_length?: unknown
  context_window?: unknown
  active?: unknown
  pricing?: { prompt?: unknown; completion?: unknown }
  providers?: { context_length?: unknown; pricing?: { input?: unknown; output?: unknown } }[]
}

function num(x: unknown): number | undefined {
  const n = typeof x === 'string' ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

export function isOpenRouterFree(m: OpenAIModel): boolean {
  const id = typeof m.id === 'string' ? m.id : ''
  if (id.endsWith(':free')) return true
  const p = num(m.pricing?.prompt)
  const c = num(m.pricing?.completion)
  return p === 0 && c === 0
}

function toInfo(provider: ProviderId, m: OpenAIModel): ModelInfo | null {
  if (typeof m.id !== 'string' || !m.id) return null
  let id = m.id
  if (provider === 'google') id = id.replace(/^models\//, '')
  if (NON_CHAT.test(id)) return null
  if (m.active === false) return null
  const label = typeof m.name === 'string' && m.name ? m.name : id
  switch (provider) {
    case 'openrouter':
      return { id, label, contextLength: num(m.context_length), free: isOpenRouterFree(m) }
    case 'groq':
      return { id, label, contextLength: num(m.context_window), free: true }
    case 'cerebras':
    case 'google':
      return { id, label, contextLength: num(m.context_length), free: true }
    case 'huggingface': {
      const ctx = m.providers?.map((p) => num(p.context_length)).find((n) => n !== undefined)
      return { id, label, contextLength: ctx }
    }
    default:
      return { id, label }
  }
}

export function parseModelList(provider: ProviderId, json: unknown): ModelInfo[] {
  const data =
    json && typeof json === 'object' && Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: unknown[] }).data as OpenAIModel[])
      : Array.isArray(json)
        ? (json as OpenAIModel[])
        : []
  const recommended = new Set(RECOMMENDED[provider])
  const seen = new Set<string>()
  const out: ModelInfo[] = []
  for (const raw of data) {
    const info = toInfo(provider, raw ?? {})
    if (!info || seen.has(info.id)) continue
    seen.add(info.id)
    out.push(recommended.has(info.id) ? { ...info, recommended: true } : info)
  }
  return sortModels(out)
}

export function sortModels(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => {
    const r = Number(Boolean(b.recommended)) - Number(Boolean(a.recommended))
    if (r !== 0) return r
    const f = Number(Boolean(b.free)) - Number(Boolean(a.free))
    if (f !== 0) return f
    return a.id.localeCompare(b.id)
  })
}
