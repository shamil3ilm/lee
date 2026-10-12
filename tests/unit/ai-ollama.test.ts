import { afterEach, describe, expect, it } from 'vitest'
import { OllamaProvider, ollamaConfig } from '@/lib/ai/ollama'
import { selectableModels } from '@/lib/ai/registry'

/**
 * Ollama serves a self-hosted model behind the same OpenAI-compatible chat API
 * as Groq, so it reuses every prompt method and changes only the transport:
 * no key, a configurable base URL, and a clear error when the server is down.
 */
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

const job = {
  title: 'Application Developer',
  company_name: 'AIU',
  remote_type: 'onsite',
  employment_type: 'fulltime',
  seniority: 'mid',
  tech_stack: ['php', 'laravel'],
  responsibilities: [],
  requirements: [],
  benefits: {},
}

function recordingFetch(response: () => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return response()
  }) as typeof fetch
  return calls
}

describe('ollamaConfig', () => {
  it('is off unless OLLAMA_BASE_URL is set', () => {
    expect(ollamaConfig({})).toBeNull()
    expect(ollamaConfig({ OLLAMA_BASE_URL: '' })).toBeNull()
  })

  it('reads the base URL, model and timeout, with defaults', () => {
    expect(ollamaConfig({ OLLAMA_BASE_URL: 'http://localhost:11434/v1/' })).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      timeoutMs: 180_000,
    })
    expect(
      ollamaConfig({
        OLLAMA_BASE_URL: 'http://gpu-box:11434/v1',
        OLLAMA_MODEL: 'llama3.2:3b',
        OLLAMA_TIMEOUT_MS: '60000',
      }),
    ).toEqual({ baseUrl: 'http://gpu-box:11434/v1', model: 'llama3.2:3b', timeoutMs: 60_000 })
  })
})

describe('OllamaProvider', () => {
  const config = { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', timeoutMs: 1_000 }

  it('calls the self-hosted chat endpoint with no API key and parses the JSON answer', async () => {
    const calls = recordingFetch(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(job) } }],
            usage: { prompt_tokens: 12, completion_tokens: 34 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    const parsed = await new OllamaProvider(config).parseJob('a job post')

    expect(parsed.title).toBe('Application Developer')
    const chat = calls.find((c) => c.url.endsWith('/chat/completions'))
    expect(chat?.url).toBe('http://localhost:11434/v1/chat/completions')
    const headers = new Headers(chat?.init.headers)
    expect(headers.has('authorization')).toBe(false)
    const body = JSON.parse(String(chat?.init.body))
    expect(body.model).toBe('qwen2.5:7b')
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('says the server is unreachable, without retrying, when Ollama is not running', async () => {
    let chatCalls = 0
    globalThis.fetch = (async (input: unknown) => {
      if (String(input).endsWith('/chat/completions')) chatCalls++
      throw new TypeError('fetch failed')
    }) as typeof fetch

    const err = await new OllamaProvider(config).parseJob('a job post').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/Ollama is not reachable at http:\/\/localhost:11434\/v1/)
    expect(chatCalls).toBe(1)
  })

  it('reports an HTTP error from Ollama with its status, e.g. a model that is not pulled', async () => {
    recordingFetch(() => new Response('{"error":"model \\"qwen2.5:7b\\" not found"}', { status: 404 }))
    await expect(new OllamaProvider(config).parseJob('a job post')).rejects.toThrow(/^ollama 404: .*not found/)
  })
})

describe('selectableModels', () => {
  it('hides the local model when Ollama is not configured', () => {
    const ids = selectableModels({ ollama: false }).map((m) => m.id)
    expect(ids).not.toContain('ollama:local')
    expect(ids).toContain('groq:gpt-oss-20b')
  })

  it('shows the local model when Ollama is configured', () => {
    expect(selectableModels({ ollama: true }).map((m) => m.id)).toContain('ollama:local')
  })

  it('keeps a saved local choice visible so the setting does not silently change', () => {
    const ids = selectableModels({ ollama: false, keepId: 'ollama:local' }).map((m) => m.id)
    expect(ids).toContain('ollama:local')
  })
})
