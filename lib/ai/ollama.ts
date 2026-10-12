import { GroqProvider } from './groq'
import { AiHttpError } from './attempts'
import { recordAiCall, type AiCallRecord } from './log-call'
import type { RateLimitSnapshot } from './rate-limit-headers'
import { fetchWithTimeout } from '@/lib/net/timeout'

export interface OllamaConfig {
  baseUrl: string
  model: string
  timeoutMs: number
}

const DEFAULT_MODEL = 'qwen2.5:7b'
// A local model on a CPU or laptop GPU is far slower than a hosted one; a CV
// tailoring prompt can take minutes.
const DEFAULT_TIMEOUT_MS = 180_000

/** Self-hosted model settings; null when OLLAMA_BASE_URL is not set. */
export function ollamaConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): OllamaConfig | null {
  const baseUrl = source.OLLAMA_BASE_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl) return null
  const timeoutMs = Number(source.OLLAMA_TIMEOUT_MS)
  return {
    baseUrl,
    model: source.OLLAMA_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  }
}

/**
 * A model served by Ollama on your own machine or server. Ollama speaks the
 * same OpenAI-compatible chat API as Groq, so this reuses every prompt method
 * and replaces only the transport: no API key, no rate-limit headers, and
 * prompts never leave the host that runs Ollama.
 */
export class OllamaProvider extends GroqProvider {
  constructor(private readonly config: OllamaConfig) {
    super('', config.model)
  }

  protected override async generateOnce(prompt: string): Promise<{
    text: string
    promptTokens: number
    completionTokens: number
    rateLimit: RateLimitSnapshot | null
  }> {
    let res: Response
    try {
      res = await fetchWithTimeout(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          }),
        },
        { timeoutMs: this.config.timeoutMs, label: 'ollama' },
      )
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(
          `Ollama is not reachable at ${this.config.baseUrl}. Start it with "ollama serve" or check OLLAMA_BASE_URL.`,
        )
      }
      throw e
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AiHttpError(`ollama ${res.status}: ${body.slice(0, 400)}`, res.status, null)
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = json.choices[0]?.message?.content
    if (!content) throw new Error('ollama: empty response content')
    return {
      text: content,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      rateLimit: null,
    }
  }

  protected override async snapshot(): Promise<void> {}

  protected override async logCall(x: AiCallRecord): Promise<void> {
    await recordAiCall('ollama', x)
  }
}
