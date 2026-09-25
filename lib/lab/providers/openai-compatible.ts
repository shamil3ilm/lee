import { ProviderError, RateLimitedError, redactSecrets } from './errors'
import type { ChatMetrics, ChatRequest, ChatResult, ProviderId } from './types'

/**
 * v14 — one adapter for every provider that speaks the OpenAI Chat
 * Completions wire format (Groq, OpenRouter, Cerebras, Google's OpenAI
 * compatibility layer, Hugging Face router, Ollama).
 *
 * Arena semantics: NO retries on HTTP errors — the user should see a 429
 * rather than wait through silent backoff. At most one retry on a network
 * failure (fetch threw before any response).
 */

export interface Endpoint {
  provider: ProviderId
  baseUrl: string // without trailing slash, e.g. https://api.groq.com/openai/v1
  apiKey?: string
  extraHeaders?: Record<string, string>
}

export interface ChatOptions {
  stream?: boolean
  onDelta?: (text: string) => void
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Injected clock for deterministic tests. */
  now?: () => number
}

const DEFAULT_TIMEOUT_MS = 55_000

export function buildHeaders(ep: Endpoint): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(ep.extraHeaders ?? {}),
  }
  if (ep.apiKey) headers.authorization = `Bearer ${ep.apiKey}`
  return headers
}

/** Instruction appended to the system prompt in JSON-schema mode. */
export function jsonSchemaInstruction(schema: object): string {
  return [
    'Respond with a single JSON value only — no prose, no markdown fences.',
    'It must conform to this JSON Schema:',
    JSON.stringify(schema),
  ].join('\n')
}

export function buildBody(model: string, req: ChatRequest, stream: boolean): Record<string, unknown> {
  const systemParts = [req.system?.trim(), req.jsonSchema ? jsonSchemaInstruction(req.jsonSchema) : '']
    .filter((s): s is string => Boolean(s))
  const messages: { role: string; content: string }[] = []
  if (systemParts.length > 0) messages.push({ role: 'system', content: systemParts.join('\n\n') })
  messages.push(...req.messages)
  const body: Record<string, unknown> = { model, messages, stream }
  if (req.temperature !== undefined) body.temperature = req.temperature
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens
  // json_object is the most widely supported structured mode across these
  // providers; the schema itself travels in the system prompt and is
  // validated on our side (lib/lab/schema-check.ts).
  if (req.jsonSchema) body.response_format = { type: 'json_object' }
  if (stream) body.stream_options = { include_usage: true }
  return body
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

async function fetchOnceWithNetworkRetry(
  f: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await f(url, init)
  } catch (e) {
    if (isAbort(e)) throw e
    // One retry on network failure only.
    return f(url, init)
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')
}

/** Map a non-2xx response to a typed error without echoing the raw body. */
export async function errorFromResponse(res: Response, ep: Endpoint): Promise<ProviderError> {
  let providerMsg = ''
  try {
    const text = await res.text()
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown }
    const m =
      typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.error?.message === 'string'
          ? parsed.error.message
          : typeof parsed.message === 'string'
            ? parsed.message
            : ''
    providerMsg = m ? redactSecrets(m, ep.apiKey ? [ep.apiKey] : []) : ''
  } catch {
    /* non-JSON body — ignore it entirely */
  }
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after'))
    return new RateLimitedError(
      `Rate limited by ${ep.provider} (free-tier quota). Try again${Number.isFinite(ra) && ra > 0 ? ` in ${Math.ceil(ra)}s` : ' shortly'}.`,
      Number.isFinite(ra) && ra > 0 ? ra : undefined,
    )
  }
  if (res.status === 401 || res.status === 403) {
    return new ProviderError(`${ep.provider} rejected the API key (${res.status}).`, {
      status: res.status,
      code: 'auth',
    })
  }
  if (res.status >= 500) {
    return new ProviderError(`${ep.provider} is unavailable (${res.status}).`, {
      status: res.status,
    })
  }
  return new ProviderError(
    `${ep.provider} returned ${res.status}${providerMsg ? `: ${providerMsg}` : '.'}`,
    { status: res.status, code: 'bad_request' },
  )
}

interface UsageShape {
  prompt_tokens?: number
  completion_tokens?: number
}

function readUsage(obj: unknown): UsageShape | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const o = obj as { usage?: UsageShape | null; x_groq?: { usage?: UsageShape } }
  return o.usage ?? o.x_groq?.usage ?? undefined
}

export function computeMetrics(x: {
  start: number
  end: number
  firstTokenAt?: number
  usage?: UsageShape
}): ChatMetrics {
  const totalMs = Math.max(0, Math.round(x.end - x.start))
  const ttftMs = x.firstTokenAt !== undefined ? Math.max(0, Math.round(x.firstTokenAt - x.start)) : undefined
  const outputTokens = x.usage?.completion_tokens
  const genMs = totalMs - (ttftMs ?? 0)
  const tokensPerSec =
    outputTokens !== undefined && genMs > 0
      ? Math.round((outputTokens / (genMs / 1000)) * 10) / 10
      : undefined
  return {
    totalMs,
    ttftMs,
    inputTokens: x.usage?.prompt_tokens,
    outputTokens,
    tokensPerSec,
  }
}

/**
 * Parse an SSE byte stream from an OpenAI-compatible endpoint. Yields each
 * JSON payload; stops at `[DONE]`. Ignores comment lines (`: OPENROUTER
 * PROCESSING`) and blank keep-alives.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '')
        buf = buf.slice(nl + 1)
        const parsed = parseSseLine(line)
        if (parsed === DONE) return
        if (parsed !== SKIP) yield parsed
      }
    }
    const tail = parseSseLine(buf.trim())
    if (tail !== DONE && tail !== SKIP) yield tail
  } finally {
    reader.releaseLock()
  }
}

const DONE = Symbol('done')
const SKIP = Symbol('skip')

function parseSseLine(line: string): unknown {
  if (!line || line.startsWith(':')) return SKIP
  if (!line.startsWith('data:')) return SKIP
  const data = line.slice(5).trim()
  if (data === '[DONE]') return DONE
  try {
    return JSON.parse(data)
  } catch {
    return SKIP
  }
}

interface ChunkShape {
  choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[]
  error?: { message?: string } | string
}

export async function chat(
  ep: Endpoint,
  model: string,
  req: ChatRequest,
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const f = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => performance.now())
  const stream = opts.stream ?? false
  const init: RequestInit = {
    method: 'POST',
    headers: buildHeaders(ep),
    body: JSON.stringify(buildBody(model, req, stream)),
    signal: withTimeout(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  }
  const start = now()
  let res: Response
  try {
    res = await fetchOnceWithNetworkRetry(f, `${ep.baseUrl}/chat/completions`, init)
  } catch (e) {
    if (isAbort(e)) throw new ProviderError(`${ep.provider} timed out.`, { code: 'timeout' })
    throw new ProviderError(`Could not reach ${ep.provider}.`, { code: 'network' })
  }
  if (!res.ok) throw await errorFromResponse(res, ep)

  if (!stream || !res.body) {
    const json = (await res.json().catch(() => null)) as (ChunkShape & object) | null
    if (!json) throw new ProviderError(`${ep.provider} returned an unreadable response.`)
    const text = json.choices?.[0]?.message?.content ?? ''
    return { text, metrics: computeMetrics({ start, end: now(), usage: readUsage(json) }) }
  }

  let text = ''
  let firstTokenAt: number | undefined
  let usage: UsageShape | undefined
  try {
    for await (const raw of parseSse(res.body)) {
      const chunk = raw as ChunkShape
      if (chunk.error) {
        const msg = typeof chunk.error === 'string' ? chunk.error : (chunk.error.message ?? '')
        const safe = redactSecrets(msg, ep.apiKey ? [ep.apiKey] : [])
        if (/rate/i.test(msg)) throw new RateLimitedError(`Rate limited by ${ep.provider} mid-stream.`)
        throw new ProviderError(`${ep.provider} stream error${safe ? `: ${safe}` : '.'}`)
      }
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        if (firstTokenAt === undefined) firstTokenAt = now()
        text += delta
        opts.onDelta?.(delta)
      }
      usage = readUsage(chunk) ?? usage
    }
  } catch (e) {
    if (e instanceof ProviderError) throw e
    if (isAbort(e)) throw new ProviderError(`${ep.provider} timed out.`, { code: 'timeout' })
    throw new ProviderError(`${ep.provider} stream was interrupted.`, { code: 'network' })
  }
  return { text, metrics: computeMetrics({ start, end: now(), firstTokenAt, usage }) }
}

/** GET {baseUrl}/models — returns the parsed JSON body. */
export async function fetchModels(
  ep: Endpoint,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch
  const headers = buildHeaders(ep)
  delete headers['content-type']
  let res: Response
  try {
    res = await fetchOnceWithNetworkRetry(f, `${ep.baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    })
  } catch (e) {
    if (isAbort(e)) throw new ProviderError(`${ep.provider} timed out.`, { code: 'timeout' })
    throw new ProviderError(`Could not reach ${ep.provider}.`, { code: 'network' })
  }
  if (!res.ok) throw await errorFromResponse(res, ep)
  const json = await res.json().catch(() => null)
  if (!json) throw new ProviderError(`${ep.provider} returned an unreadable model list.`)
  return json
}
